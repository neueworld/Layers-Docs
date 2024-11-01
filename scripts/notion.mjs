import { Client } from '@notionhq/client';


const token = "secret_hQHIFZKEuTw4MDnMhQ52eiJD2GYBIJAY7DBlgz1UgHr"
const fetchNotionResources = async (accessToken) => {
  const notion = new Client({ auth: accessToken });

  const fetchDatabases = async () => {
    const response = await notion.search({
      filter: { property: 'object', value: 'database' }
    });
    return response.results.filter((item) => item.object === 'database');
  };

  const fetchPages = async () => {
    const response = await notion.search({
      filter: { property: 'object', value: 'page' }
    });
    return response.results.filter((item) => item.object === 'page');
  };

  const databases = await fetchDatabases();
  const pages = await fetchPages();

  return { databases};
};


async function main(){

    const data = await fetchNotionResources(token)
    console.log(data)
    data.databases.forEach(database => {
        // The title is stored in an array, so we need to access its first element
        const title = database.title[0]?.plain_text || 'Untitled';
        console.log(title);
      });
}

main()

