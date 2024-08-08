import { config } from "dotenv";
config()
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { prompts, promptMappings,fetchRepoData,getTechStack } from './utility.mjs';

const model = new ChatOpenAI({ model: "gpt-4" });
const parser = new StringOutputParser();

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const messages = [
  new SystemMessage("Translate the following from English into Hindi"),
  new HumanMessage("hi!"),
];


// const chain = promptTemplate.pipe(model).pipe(parser);
// const result = await chain.invoke({ language: "italian", text: "Good Bye" });

// console.log(result)

async function fetchAndSendRepoData(owner, repo, selectedPromptKey) {
  try {
      const fields = promptMappings[selectedPromptKey];
      const repoData = await fetchRepoData(owner, repo, fields);
      
      if (fields.includes('techStack')) {
          repoData.techStack = await getTechStack(owner, repo);
      }
  
      const data = {
          url: `https://github.com/${owner}/${repo}`,
          ...repoData
      };
      
    console.log(data)

    const prompt = prompts[selectedPromptKey];
    const systemTemplate = "Generate content based on the following data:";
    const userTemplate = "{prompt}\n\n{data}";
    console.log(prompt)
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", prompt],
      ["user", userTemplate],
    ]);

    const chain = promptTemplate.pipe(model).pipe(parser);
    const result = await chain.invoke({ 
      prompt: prompt,
      data: JSON.stringify(data, null, 2)
    
    });
    // const result = await promptTemplate.invoke({ data: JSON.stringify(data, null, 2) });
    console.log(result);

  } catch (error) {
      console.error('Error fetching and sending repository data to OpenAI:', error);
  }
}

(async () => {
    
      const owner = 'neueworld';
      const repo = 'layers';
      const selectedCategory = "Project Showcasing"; // Specify the category here
      await fetchAndSendRepoData(owner,repo,selectedCategory)

  })();
  

// const result = await model.invoke(messages);
// const answer = await parser.invoke(result)
// console.log(answer)