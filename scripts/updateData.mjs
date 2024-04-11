import axios from 'axios';
import 'dotenv/config'
import MarkdownIt from 'markdown-it';
import { getCollection, getCollectionItems } from './webflow.mjs';

const markdownIt = new MarkdownIt();
const siteId = "660e763c275e50fdf03ef908";

const getAllCollectionItems = async (siteId) => {
  try {
    const collectionsResponse = await getCollection(siteId);
    const allItems = [];

    for (const collection of collectionsResponse.collections) { // Access the nested array
      const collectionItems = await getCollectionItems(collection.id);
      allItems.push({
        collectionId: collection.id,
        items: collectionItems.items,
      });
    }

    return allItems;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

// Example usage
(async () => {
  const allCollectionItems = await getAllCollectionItems(siteId);
  console.log(allCollectionItems);
})();


const getLatestChangesAndUpdateWebflow = async (owner, repo) => {
  try {
    // Get the latest commit
    const commitResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    const latestCommitSha = commitResponse.data[0].sha;

    // Get the list of files changed in the latest commit
    const commitDetailsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits/${latestCommitSha}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    const changedFiles = commitDetailsResponse.data.files;

    console.log("The changed files are : ",changedFiles)
    // Fetch the content of each changed file and update Webflow CMS
    for (const file of changedFiles) {
      if (file.filename.endsWith('.md')) {
        const fileName = file.filename.split('/').pop().replace('.md', '');
        console.log('File Name:', fileName);

        const fileContentResponse = await axios.get(file.contents_url, {
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`
          }
        });

        const decodedContent = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
        const htmlContent = markdownIt.render(decodedContent);
        console.log(htmlContent)
        // Update the Webflow item
        // Note: You'll need to provide the correct collectionId, itemId, itemName, and itemSlug
       // await updateWebflowItem("collectionId", "itemId", htmlContent, "itemName", "itemSlug");

        console.log(`Updated Webflow CMS with content from: ${file.filename}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
};

// Example usage

const owner = 'neueworld';
const repo = 'Layers-Docs';

//getLatestChangesAndUpdateWebflow(owner,repo);
