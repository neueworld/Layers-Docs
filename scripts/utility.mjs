import axios from 'axios';

const API_BASE_URL = 'https://localhost:8000';

async function createNewIntegration(userId, notionDbId, collectionId) {
  try {
    const response = await axios.post(`${API_BASE_URL}/create-new-integration/`, {
      user_id: userId,
      notion_db_id: notionDbId,
      collection_id: collectionId
    });

    return response.data;
  } catch (error) {
    handleAxiosError(error, 'creating the integration');
  }
}

async function saveIntegration(userId, integrationId, mapping) {
  try {
    const response = await axios.post(`${API_BASE_URL}/save-integration/`, {
      user_id: userId,
      integration_id: integrationId,
      mapping: mapping
    });

    return response.data;
  } catch (error) {
    handleAxiosError(error, 'saving the integration');
  }
}

function handleAxiosError(error, action) {
  if (error.response) {
    console.error(`Error response while ${action}:`, error.response.data);
    throw new Error(error.response.data.error || `An error occurred while ${action}`);
  } else if (error.request) {
    console.error("No response received:", error.request);
    throw new Error('No response received from the server');
  } else {
    console.error("Error:", error.message);
    throw new Error(`An error occurred while ${action}`);
  }
}

async function testIntegrations() {

    const user_id = "112375651083827373276"
    const notion_db_id = "897e0470ab9a4ae686ab073e81841894"
    const collection_id = "66e91122171ca3c3351ff1a8"
    

  try {
    // Create a new integration
    console.log("Creating new integration...");
    const newIntegration = await createNewIntegration(user_id, notion_db_id, collection_id);
    console.log('New integration created:', newIntegration);

    // Save integration rules
    // console.log("\nSaving integration rules...");
    // const savedIntegration = await saveIntegration(user_id, newIntegration.integration_id, {
    //   field1: 'value1',
    //   field2: 'value2'
    // });
    // console.log('Integration saved:', savedIntegration);

  } catch (error) {
    console.error('An error occurred:', error.message);
  }
}

// Run the test
testIntegrations();