# Python YouTube Music search preview

Deploy this directory as a **separate Vercel project**. Do not link it to the existing Node search project. Leave the production backend pointed at its current provider while evaluating the preview.

- Python 3.12, `ytmusicapi` 1.12.4, no Google credentials.
- Singapore compute (`sin1`); independently, YouTube Music catalog defaults to `YT_MUSIC_LOCATION=ID` and `YT_MUSIC_LANG=en`.
- Set a fresh `SEARCH_API_TOKEN` in the project's Preview environment. If Deployment Protection applies, configure a separate supported automation secret for the test client.
- Use a preview deploy (not `--prod`), then probe `/api/search` from the backend container without changing its environment. Send `Authorization: Bearer …` and JSON `{"query":"good life","type":"song"}`. Repeat with `"video"`. Videos use the YouTube Music catalog, not general YouTube search.
- Compare exact IDs, cold and warm timings, and errors. Check unauthenticated access is refused. Test a disposable web room and Telegram before switching production. Separate the cache namespace at cutover; retain the old URL and credentials for rollback.

Run local tests from this directory: `python -m pip install -r requirements.txt` and `python -m unittest -v`.
