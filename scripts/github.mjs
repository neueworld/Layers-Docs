import { config } from "dotenv";
config()
import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";

export const run = async () => {
  const loader = new GithubRepoLoader(
    "https://github.com/neueworld/Proof-Engine",
    {
      branch: "main",
      recursive: true,
      processSubmodules: true,
      unknown: "warn",
      maxConcurrency: 5, // Defaults to 2
    }
  );
  const docs = await loader.load();
  console.log({ docs });
};

run()