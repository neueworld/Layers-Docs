import { config } from "dotenv";
config()
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const resumeSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "The full name of the person" },
    email: { type: "string", description: "The email address of the person" },
    linkedIn: { type: "string", description: "The LinkedIn profile URL of the person" },
    summary: { type: "string", description: "A brief summary or objective statement" },
    topSkills: { type: "array", items: { type: "string" }, description: "List of top skills mentioned in the resume" },
    languages: { type: "array", items: { type: "string" }, description: "List of languages known and their proficiency levels" },
    certifications: { type: "array", items: { type: "string" }, description: "List of certifications mentioned in the resume" },
    currentPosition: { type: "string", description: "The current job title and company" },
    location: { type: "string", description: "The current location of the person" },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          position: { type: "string" },
          duration: { type: "string" },
          location: { type: "string" },
          description: { type: "string" }
        },
        required: ["company", "position", "duration", "location"]
      },
      description: "List of work experiences"
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          institution: { type: "string" },
          degree: { type: "string" },
          field: { type: "string" },
          year: { type: "string" }
        },
        required: ["institution", "degree", "year"]
      },
      description: "List of educational qualifications"
    }
  },
  required: ["name", "email", "linkedIn", "topSkills", "languages", "currentPosition", "location", "experience", "education"]
};

const outputParser = new JsonOutputFunctionsParser();

const model = new ChatOpenAI({modelName: "gpt-4"});

const prompt = ChatPromptTemplate.fromTemplate(`
Extract the following information from the given resume text. If a piece of information is not present, use null or an empty array as appropriate.

Resume text:
{resume_text}
`);

const extractionFunction = {
  name: "extract_resume_info",
  description: "Extracts structured information from a resume",
  parameters: resumeSchema,
};

const chain = RunnableSequence.from([
  prompt,
  model.bind({ functions: [extractionFunction], function_call: { name: "extract_resume_info" } }),
  outputParser,
]);

async function processPdfContent(pdfContent) {
  const result = await chain.invoke({
    resume_text: pdfContent,
  });

  return result;
}

async function main() {
    
    const pdfPath = "./vin.pdf"
    // Step 1: Load the PDF file
    const loader = new PDFLoader(pdfPath, { splitPages: false,parsedItemSeparator: "",
    });
    const docs = await loader.load();
    
    // Combine all pages' text into a single string
    const pdfContent = docs.map(doc => doc.pageContent).join("\n");
    if (!pdfContent || pdfContent.trim() === '') {
      throw new Error("The PDF content is empty or could not be extracted.");
  }
  

  try {
    const result = await processPdfContent(pdfContent);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error processing PDF content:", error);
  }
}

main();

export { processPdfContent };