import axios from 'axios';
import 'dotenv/config'
import MarkdownIt from 'markdown-it';
import { getCollection, getCollectionItems,updateWebflowItem,getAllCollectionItems } from './webflow.mjs';

const markdownIt = new MarkdownIt();
const siteId = "660e763c275e50fdf03ef908";

const owner = 'neueworld';
const repo = 'Layers-Docs';

const getLatestCommitSha = async (owner, repo, branch) => {
  const commitResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${branch}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  return commitResponse.data.sha;
};

// Function to get the list of files changed in the latest commit from a specified branch
const getChangedFiles = async (owner, repo, branch) => {
  const commitSha = await getLatestCommitSha(owner, repo, branch);
  const commitDetailsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  const allFiles = commitDetailsResponse.data.files;

  // Filter for Markdown files (case-insensitive)
  const changedMarkdownFiles = allFiles.filter(file => file.filename.toLowerCase().endsWith('.md'));
  return changedMarkdownFiles;
};


// Function to update Webflow with the content of a changed file
const updateWebflowWithFileContent = async (file, collectionId, item) => {
  if (file.filename.endsWith('.md')) {
    const fileContentResponse = await axios.get(file.contents_url, {
      headers: {
        Authorization: `token ${process.env.GT_TOKEN}`
      }
    });

    const decodedContent = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
    const htmlContent = markdownIt.render(decodedContent);
   // console.log(htmlContent)
    // Update the Webflow item
    
    // console.log(
    //      "collection Id : ", collectionId,
    //       "Item id : ",item.id, 
    //       "name : ",item.fieldData.name, 
    //       "slug: ",item.fieldData.slug,
    //       "Content : ",htmlContent

    // )
    // try{
    // await updateWebflowItem(
    //       collectionId,
    //       item.id, 
    //       htmlContent, 
    //       item.fieldData.name, 
    //       item.fieldData.slug
    // );
    // console.log(`Updated Webflow CMS with content from: ${file.filename}`);
    // }catch(err){
    //   console.log("Data Update failed")
    // }
  }
};

// Refactored main function
const getLatestChangesAndUpdateWebflow = async (owner, repo, siteId) => {
  try {
    const latestCommitSha = await getLatestCommitSha(owner, repo,"main");
    const changedFiles = await getChangedFiles(owner, repo, latestCommitSha,"main");
    // Get all collection items
    const allCollectionItems = await getAllCollectionItems(siteId);

    // allCollectionItems.forEach(collection => {
    //   console.log(`Processing collection with ID: ${collection.collectionId}`);
    //   collection.items.forEach(item => {
    //     console.log(`Item ID: ${item.id}, Name: ${item.fieldData.name}, Slug: ${item.fieldData.slug}`);
    //     // Here you can add more logic to process each item
    //   });
    // });
  
    changedFiles.forEach(async (file) => {
      const fileName = file.filename.split('/').pop().replace('.md', '');
      allCollectionItems.forEach(async (collection) => {
        collection.items.forEach(async (item) => {
           console.log("The Item is : ",item)
          if (item.fieldData.name === fileName) {
            console.log(`Match found: Updating ${fileName}`);
            //await updateWebflowWithFileContent(file, collection.collectionId, item);
          }
        });
      });
    });

    // for (const file of changedFiles) {
    //   await updateWebflowWithFileContent(file, webflowToken);
    // }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

// Example usage
const main = async (owner, repo, siteId) => {
  try {
    // Get the latest changes and update Webflow CMS
    await getLatestChangesAndUpdateWebflow(owner, repo, siteId);
  } catch (error) {
    console.error('Error:', error.message);
  }
};

main(owner,repo,siteId)
