"""Upload a package and submit for review using the official Chrome Web Store v2 API."""

import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


def request(url, *, data=None, token=None, content_type=None):
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not print response bodies: OAuth errors can contain credentials.
        raise RuntimeError(f'API request failed with HTTP {error.code}; check credentials and the Developer Dashboard.') from None


def main():
    keys = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID']
    missing = [key for key in keys if not os.environ.get(key)]
    if missing:
        raise RuntimeError('Missing configuration: ' + ', '.join(missing))
    auth = urllib.parse.urlencode({
        'client_id': os.environ['CWS_CLIENT_ID'],
        'client_secret': os.environ['CWS_CLIENT_SECRET'],
        'refresh_token': os.environ['CWS_REFRESH_TOKEN'],
        'grant_type': 'refresh_token',
    }).encode()
    token = request('https://oauth2.googleapis.com/token', data=auth,
                    content_type='application/x-www-form-urlencoded')['access_token']
    print(f'::add-mask::{token}', flush=True)
    publisher = urllib.parse.quote(os.environ['CWS_PUBLISHER_ID'], safe='')
    item = urllib.parse.quote(os.environ['CWS_EXTENSION_ID'], safe='')
    resource = f'publishers/{publisher}/items/{item}'
    base = f'https://chromewebstore.googleapis.com/v2/{resource}'

    status = request(base + ':fetchStatus', token=token)
    if sys.argv[1:] == ['--check-only']:
        revision = status.get('publishedItemRevisionStatus', {})
        versions = [channel['crxVersion'] for channel in revision.get('distributionChannels', [])]
        print(f'Authentication and item access verified. Published state: {revision.get("state", "UNPUBLISHED")}; versions: {versions}')
        return
    package = Path(sys.argv[1])
    with zipfile.ZipFile(package) as archive:
        version = json.loads(archive.read('manifest.json'))['version']
    pending = status.get('submittedItemRevisionStatus', {}).get('state')
    if pending in ('PENDING_REVIEW', 'STAGED'):
        raise RuntimeError(f'Existing submission is {pending}; refusing to replace it.')
    channels = status.get('publishedItemRevisionStatus', {}).get('distributionChannels', [])
    version_tuple = lambda value: tuple((list(map(int, value.split('.'))) + [0] * 4)[:4])
    if any(version_tuple(version) <= version_tuple(channel['crxVersion']) for channel in channels):
        raise RuntimeError('Package version must be higher than the published version.')

    uploaded = request(f'https://chromewebstore.googleapis.com/upload/v2/{resource}:upload',
                       data=package.read_bytes(), token=token, content_type='application/zip')
    state = uploaded.get('uploadState')
    # Bound polling to 12 attempts; never wait indefinitely for processing.
    for _ in range(12):
        if state != 'UPLOAD_IN_PROGRESS':
            break
        time.sleep(5)
        state = request(base + ':fetchStatus', token=token).get('lastAsyncUploadState')
    if state != 'SUCCEEDED':
        raise RuntimeError(f'Upload did not succeed: {state}. Check the dashboard before retrying.')
    request(base + ':publish', data=b'{}', token=token, content_type='application/json')
    print(f'Version {version} submitted for review. Publication still requires Google approval.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
