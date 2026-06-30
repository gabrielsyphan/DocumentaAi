import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    check()
      .then((u) => { if (u) setUpdate(u); })
      .catch(() => {});
  }, []);

  async function installUpdate() {
    if (!update || installing) return;
    setInstalling(true);

    let downloaded = 0;
    let total = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        if (total > 0) setProgress(Math.round((downloaded / total) * 100));
      } else if (event.event === "Finished") {
        setProgress(100);
      }
    });

    await relaunch();
  }

  return { update, progress, installing, installUpdate };
}
