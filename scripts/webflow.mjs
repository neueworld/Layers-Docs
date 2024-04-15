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
    url: `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}/live`,
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
    console.error('Error updating item:');
    // Check for the specific error message and handle it
    if (error.response && error.response.data && error.response.data.msg === "Conflict: Live PATCH updates can't be applied to items that have never been published") {
      console.log('Item has never been published. Attempting to publish now...');
      try {
        await publishCollectionItem(collectionId, [itemId]);
        console.log('Re-attempting item update...');
        await updateWebflowItem(collectionId, itemId, richTextContent, itemName, slug);  // Recursive call to retry update
      } catch (publishError) {
        console.error('Failed after publishing attempt:', publishError.data.message);
        //throw publishError;
      }
    } else {
      console.log("Item publishing failed")
     // throw error;
    }
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

const fetchRepoTree = async (owner, repo, token) => {
  const config = {
    headers: {
      Authorization: `token ${token}`,
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
  console.log(structure)
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

// Usage example
const owner = 'neueworld';
const repo = 'Layers-Docs';
const githubToken = process.env.GT_TOKEN
const pageId = ""
const webflowToken = process.env.WEBFLOW_API_TOKEN
// fetchAndPushContent(owner, repo, githubToken, pageId, webflowToken)
//   .then(() => console.log('Content updated successfully!'))
//   .catch(error => console.error(error));

const fetchCollectionItems = async () => {
  try {
    const response = await getCollection(siteId);
    const collections = response.collections; // Assuming the API response has a 'collections' property that is an array
    if (Array.isArray(collections)) {
      for (const collection of collections) {
        const itemsResponse = await getCollectionItems(collection.id);
        const items = itemsResponse.items; // Assuming the API response has an 'items' property that is an array
        console.log(`Items in collection "${collection.displayName}":`);
        for (const item of items) {
          console.log(`- Item ID: ${item.id}`);
          console.log(`  Field Data:`, item.fieldData); // Print the field data
        }
      }
    } else {
      console.error('Error: Expected an array of collections, but received:', collections);
    }
  } catch (error) {
    console.error('Error fetching collection items:', error);
  }
};

// (async () => {
//   const response = await getCollectionItems("66176d53af1acf9c387a2e19");
//   console.log(response)
//   if (response && response.items) {
//     response.items.forEach(item => {
//       console.log(item,item.fieldData);
//     });
//   }
// })();


//getCollection(siteId)

// (async () => {
//   const itemName = "What is Layers";
//   const itemSlug = "what-is-layers";
//   const fieldData = { name: itemName, slug: itemSlug, data: "This is Layers" };

//   const exists = await isItemExist(collectionId, itemName, itemSlug);
//   if (!exists) {
//     const createdItem = await createCollectionItem(collectionId, fieldData);
//     console.log('Item created successfully:', createdItem);
//   } else {
//     console.log('Item already exists');
//   }
// })();
