import axios from 'axios';
import 'dotenv/config'
import MarkdownIt from 'markdown-it';

const markdownIt = new MarkdownIt();
const siteId = "660e763c275e50fdf03ef908";
const collectionId = '6613d5ab30544bc293e55431'; 
const itemId = '66140abdec763fda057f253e'; 
const name =  "Soluta Eos";
const slug = "soluta-eos";

const deleteCollectionItem = async (collectionId, itemId) => {
  const options = {
    method: 'DELETE',
    url: `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}/live`,
    headers: {
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
    }
  };

  try {
    const response = await axios.request(options);
    console.log('Item deleted successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error deleting item:', error);
    throw error;
  }
};

// Example usage:
// deleteCollectionItem('580e63fc8c9a982ac9b8b745', '580e64008c9a982ac9b8b754');

export const getAllCollectionItems = async (siteId) => {
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


async function publishCollectionItem(collectionId, itemIds) {
  const options = {
    method: 'POST',
    url: `https://api.webflow.com/v2/collections/${collectionId}/items/publish`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`
    },
    data: { itemIds: itemIds }
  };

  axios.request(options)
    .then(function (response) {
      console.log('Publish Success:', response.data);
    })
    .catch(function (error) {
      console.error('Publish Error:');
    });
}

// export async function updateWebflowItem(collectionId, itemId, richTextContent,itemName,slug) {
//   const options = {
//     method: 'PATCH',
//     url: `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}/live`,
//     headers: {
//       accept: 'application/json',
//       'content-type': 'application/json',
//       authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
//     },
//     data: {
//       isArchived: false,
//       isDraft: false,
//       fieldData: {
//         name: itemName,
//         slug: slug,
//         data: richTextContent
//       }
//       }
//   };

//   try {
//     const response = await axios.request(options);
//     //console.log(response.data)
//     console.log('Item updated successfully:', response.data);
//   } catch (error) {
//     console.error('Error updating item:', error.response ? error.response.data : error);
//   }
// }
export async function updateWebflowItem(collectionId, itemId, richTextContent, itemName, slug) {
  const options = {
    method: 'PATCH',
    url: `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}/`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Use your Webflow API token
    },
    data: {
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: itemName,
        slug: slug,
        data: richTextContent
      }
    }
  };

  try {
    //await publishCollectionItem(collectionId, [itemId])
    const response = await axios.request(options);
    console.log('Item updated successfully:', response.data);
  } catch (error) {
    console.log(error)
  }
}

async function createCollection(siteId,displayName,singularName,slug) {
  const options = {
    method: 'POST',
    url: `https://api.webflow.com/v2/sites/${siteId}/collections`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
    },
    data: {displayName: displayName, singularName: singularName, slug: slug}

  };

  try {
    const response = await axios.request(options);
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}
const createCollectionItem = async (collectionId,fieldData) => {
  const options = {
    method: 'POST',
    url: `https://api.webflow.com/v2/collections/${collectionId}/items/live`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
    },
    data: {
      isArchived: false,
      isDraft: false,
      fieldData: fieldData
    }
  };

  try {
    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
export const getCollection = async (siteId) => {
  const options = {
    method: 'GET',
    url: `https://api.webflow.com/v2/sites/${siteId}/collections`,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
    }
  };

  try {
    const response = await axios.request(options);
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
export const getCollectionItems = async (collectionId) => {
  const options = {
    method: 'GET',
    url: `https://api.webflow.com/v2/collections/${collectionId}/items`,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}` // Replace with your Webflow API token
    }
  };

  try {
    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

function buildRepoStructure(tree) {
  const root = {};

  for (const item of tree) {
    const pathParts = item.path.split('/');
    let current = root;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (i === pathParts.length - 1) {
        // If it's the last part, add the file or blob
        current[part] = item;
      } else {
        // If it's not the last part, add a directory if it doesn't exist
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }

  return root;
}

const fetchRepoTree = async (owner, repo) => {
  const config = {
    headers: {
      Authorization: `token ${process.env.GT_TOKEN}`,
    },
  };

  // Fetch the repository's default branch
  const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, config);
  const defaultBranch = repoInfo.data.default_branch;

  // Fetch the tree of the repository's default branch
  const treeResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, config);
  const tree = treeResponse.data.tree;

  // Filter out unwanted paths like 'node_modules'
  const filteredTree = tree.filter(item => !item.path.includes('.history'));
  const structure = buildRepoStructure(filteredTree)
  //console.log(structure)
  return filteredTree;
};

const updateWebflowPage = async (pageId, content, webflowToken) => {
  const config = {
    headers: {
      Authorization: `Bearer ${webflowToken}`,
      'Content-Type': 'application/json',
    },
  };

  const data = {
    fields: {
      'custom-code-before-body': content, // or wherever you want to inject the content
    },
  };

  await axios.patch(`https://api.webflow.com/pages/${pageId}`, data, config);
};

const isItemExist = async (collectionId, itemName, itemSlug) => {
  try {
    const collectionItems = await getCollectionItems(collectionId);
    return collectionItems.items.some(item => {
      return item.fieldData.name === itemName && item.fieldData.slug === itemSlug;
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const fetchAndPushContent = async (owner, repo, token, pageId, webflowToken) => {
  const repoTree = await fetchRepoTree(owner, repo, token);
  const collections = await getCollection(siteId);
  for (const item of repoTree) {
    if (item.type === 'blob' && item.path.endsWith('.md') && item.path === 'challenges.md') {
      console.log("layers ID Found")
      // Fetch the content of each file
      const fileContentResponse = await axios.get(item.url, {
        headers: {
          Authorization: `token ${process.env.GT_TOKEN}`,
        },
      });   

      console.log(fileContentResponse)
     // const fileContent = fileContentResponse.data.content;
      //const decodedContent = base64.decode(fileContentResponse.data.content);
      const decodedContent = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
      console.log(decodedContent)
      const htmlContent = markdownIt.render(decodedContent);
      updateWebflowItem("66176d53af1acf9c387a2e19", "66176d9ab4125dd5129fcabd", htmlContent,"Challenges","challenges");

      // console.log("-<---- The content Starts here ----->")
      // console.log("")
      console.log(htmlContent)
      // console.log("-<---- The content Ends here ----->")
      // console.log("------")
      // console.log("")
      // Update the Webflow page with the content
     // await updateWebflowPage(pageId, fileContent, webflowToken);
    }
  }
};
const getItemIdIfExists = async (collectionId, itemName, itemSlug) => {
  try {
    const collectionItems = await getCollectionItems(collectionId);
    const item = collectionItems.items.find(item => 
      item.fieldData.name === itemName && item.fieldData.slug === itemSlug
    );
    return item ? item.id : null; // Return item ID if found, else return null
  } catch (error) {
    console.error("Error fetching collection items: ", error);
    throw error;
  }
};

const updateAllItems = async (owner, repo, siteId) => {
  const repoTree = await fetchRepoTree(owner, repo);
  const collections = await getCollection(siteId);

  for (const item of repoTree) {
    if (item.type === 'blob' && item.path.endsWith('.md')) {
      const itemName = item.path.replace('.md', '').split('/').pop();
      const slug = itemName.toLowerCase().replace(/\s+/g, '-');
      // Iterate through each collection to find a matching collection for the file
      for (const collection of collections.collections) {
        const itemId = await getItemIdIfExists(collection.id, itemName, slug);
        if (itemId) {
          console.log("Name: ", itemName, " Slug: ", slug, " Item Id :",itemId);
          const fileContentResponse = await axios.get(item.url, {
            headers: {
              Authorization: `Bearer ${process.env.GT_TOKEN}`,
              Accept: 'application/vnd.github.v3.raw'
            },
          });
      
        
          const htmlContent = markdownIt.render(fileContentResponse.data);
          console.log(`Updating Webflow item: ${itemName} in collection: ${collection.displayName}`);
          await updateWebflowItem(collection.id, itemId, htmlContent, itemName, slug);
        } else {
          console.log(`No existing item matches: ${itemName} in collection: ${collection.displayName}`);
        }
      }
      
    }
  }
};


const publishAllItems = async (owner, repo, siteId) => {
  const collections = await getAllCollectionItems(siteId);
  for (const collection of collections) {
    console.log("Current Collection: ", collection);
  
    // Now iterate through each item within the collection
    for (const item of collection.items) {
      console.log("Current Item: ", item);
      
      // Use the fieldData from each item
      const itemId = await getItemIdIfExists(collection.collectionId, item.fieldData.name, item.fieldData.slug);
      
      if (itemId) {
        console.log("Item ID Found: ", itemId);
        // Assuming `publishCollectionItem` function takes a collection ID and an array of item IDs
        await publishCollectionItem(collection.collectionId, [itemId]);
      } else {
        console.log(`No existing item matches: ${item.fieldData.name} in collection: ${collection.collectionId}`);
      }
    }
  }
};


// Usage example
const owner = 'neueworld';
const repo = 'Layers-Docs';

const main = async (owner, repo, siteId) => {
  try {
    console.log("Starting update process...");
    //await updateAllItems(owner, repo, siteId);
    console.log("Update process completed successfully. Starting publishing process...");

    await publishAllItems(owner, repo, siteId);
    //console.log("Publishing process completed successfully.");


    console.log("----- Checking Collection Items -----")
    const collectionItems = await getAllCollectionItems(siteId)

    // Loop through each collection in the collectionItems array
    collectionItems.forEach(collection => {
      console.log(`Collection ID: ${collection.collectionId}`);
      
      // Loop through each item in the items array of the current collection
      collection.items.forEach(item => {
        // Assuming item object is already populated similar to the 'items' example you provided
        console.log(`Name: ${item.fieldData.name}`);
        console.log(`Slug: ${item.fieldData.slug}`);
        console.log(`Data: ${item.fieldData.data}`);
        console.log('---'); // Separator for better readability
      });
    });

        
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
};



// Example usage of the main function
main(owner, repo, siteId);
