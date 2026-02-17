function App() {
    return (
        <div className="bg-slate-200 min-w-[400px] min-h-[400px]">
            <div className="max-w-3xl mx-auto px-6 py-10 text-gray-800">
                <h1 className="text-3xl font-bold mb-4">
                    How to Install a Chrome Extension from ZIP
                </h1>

                <p className="mb-6">
                    <a href={"https://github.com/faytranevozter/telegram-music-party/releases/latest/download/extension.zip"} target="_blank"
                    className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                    Download ZIP
                    </a>
                </p>

                <ol className="list-decimal pl-6 space-y-2 mb-8">
                    <li>Extract the ZIP file if it is compressed.</li>
                    <li>Open Google Chrome.</li>
                    <li>
                    Go to
                    <a target="_blank" href="chrome://extensions"
                        className="text-blue-600 underline mx-1">
                        chrome://extensions/
                    </a>
                    in the address bar.
                    </li>
                    <li>Enable <strong>Developer mode</strong> (top-right toggle).</li>
                    <li>Click <strong>"Load unpacked"</strong>.</li>
                    <li>Select the extracted folder containing the extension.</li>
                    <li>The extension will be installed and ready to use.</li>
                </ol>

                <p className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-10 rounded">
                    <strong>Tip:</strong> Click the puzzle icon 🧩 in the toolbar to manage extensions.
                </p>

                <h2 className="text-2xl font-semibold mb-4">How to Use this Bot</h2>
                <ol className="list-decimal pl-6 space-y-2 mb-10">
                    <li>
                    Add
                    <a href="https://t.me/xmsc_bot" target="_blank"
                        className="text-blue-600 underline mx-1">@xmsc_bot</a>
                    to your Telegram group.
                    </li>
                    <li>Run the command <code className="bg-gray-100 px-1 py-0.5 rounded">/register</code> in the group chat.</li>
                    <li>Input the code displayed in the extension to link it to the bot.</li>
                    <li>Click the <strong>"Join"</strong> button in the extension.</li>
                </ol>

                <h2 className="text-2xl font-semibold mb-4">How to Add Queue</h2>
                <ol className="list-decimal pl-6 space-y-2">
                    <li>Find the music you want to add to the queue.</li>
                    <li>
                    Tag
                    <a href="https://t.me/xmsc_bot" target="_blank"
                        className="text-blue-600 underline mx-1">@xmsc_bot</a>
                    in the group chat followed by:
                    <code className="bg-gray-100 px-1 py-0.5 rounded">
                        @xmsc_bot search Shape of You here
                    </code>
                    </li>
                    <li>Click <strong>"Add to queue"</strong> from the results.</li>
                    <li>Run <code className="bg-gray-100 px-1 py-0.5 rounded">/play</code> to play music.</li>
                </ol>
            </div>
        </div>
    );
}

export default App;
