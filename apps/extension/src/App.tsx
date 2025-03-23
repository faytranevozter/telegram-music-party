import { useEffect, useState } from "react";
import { addToast, Button, Input, Switch } from "@heroui/react";
import { firstValueFrom, from, map, of, switchMap } from "rxjs";
import { AnimatePresence, motion } from "framer-motion";

function App() {
    const [selfHosted, setSelfHosted] = useState(false);
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await chrome.storage.local.set({
            partyUrl: data.get("partyUrl") || "https://party.dhoniaridho.com",
            roomId: data.get("roomId"),
        });

        addToast({
            title: "Updated Party Config",
        });
        const url = "*://*.youtube.com/*";
        chrome.tabs.query({ url: url }, (tabs) => {
            tabs.forEach((t) => chrome.tabs.reload(t.id as number));
        });
    };

    const [partyUrl, setPartyUrl] = useState("");

    useEffect(() => {
        (async () => {
            await firstValueFrom(
                from(chrome.storage?.local?.get("partyUrl") || of()).pipe(
                    map((v) => v.partyUrl as string),
                    switchMap(async (v) => {
                        if (!v) {
                            const defaultValue =
                                "https://party.dhoniaridho.com";
                            return defaultValue;
                        }
                        setPartyUrl(v);
                        return v;
                    }),
                    switchMap(async (v) => {
                        console.log(v);
                        await chrome.storage.local.set({
                            partyUrl: v,
                        });

                        setPartyUrl(v);
                        return v;
                    })
                )
            );
        })();
    }, []);

    return (
        <main className="bg-slate-200 min-w-[400px] min-h-[400px]">
            <div className="flex justify-center items-center w-full min-h-screen">
                <div className="flex flex-col gap-5 justify-center items-center w-full max-w-xl px-5">
                    <form
                        className="w-full flex justify-center gap-3 flex-col"
                        onSubmit={handleSubmit}
                    >
                        <div>
                            <h1 className="text-2xl font-bold">Party Config</h1>
                        </div>

                        <Input
                            name="roomId"
                            label="Room Id"
                            defaultValue={partyUrl}
                            placeholder="Room Id"
                        />

                        <Switch
                            size="sm"
                            onChange={(e) => setSelfHosted(e.target.checked)}
                        >
                            Self Hosted
                        </Switch>
                        <AnimatePresence>
                            {selfHosted && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "100%", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                >
                                    <Input
                                        color="success"
                                        name="partyUrl"
                                        label="Party Url"
                                        defaultValue={partyUrl}
                                        placeholder="https://party.dhoniaridho.com"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <Button
                            size="sm"
                            type="submit"
                            color="primary"
                            className="w-full"
                        >
                            Submit
                        </Button>
                    </form>
                </div>
            </div>
        </main>
    );
}

export default App;
