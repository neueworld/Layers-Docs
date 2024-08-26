import { config } from "dotenv";
config()

import {
    ChatPromptTemplate,
    FewShotChatMessagePromptTemplate,
  } from "@langchain/core/prompts";
  import {ChatOpenAI} from "@langchain/openai";

  const examples = [
    { input: "2+2", output: "4" },
    { input: "2+3", output: "5" },
  ];

const model = new ChatOpenAI({ model: "gpt-4" });

  // This is a prompt template used to format each individual example.
const examplePrompt = ChatPromptTemplate.fromMessages([
    ["human", "{input}"],
    ["ai", "{output}"],
  ]);
  const fewShotPrompt = new FewShotChatMessagePromptTemplate({
    examplePrompt,
    examples,
    inputVariables: [], // no input variables
  });
  

const finalPrompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a wondrous wizard of math."],
    fewShotPrompt,
    ["human", "{input}"],
  ]);

  const chain = finalPrompt.pipe(model);

const result = await chain.invoke({ input: "What's the square of a triangle?" });
console.log(result)
  