import CacheClient from "./Client";

export type Query = string;
export type Variables = object;
type Result = object;
export type GraphQLClientOptions = {
  uri: string;
  fetch: any;
};

class GraphQLClient {
  private uri: string;
  private cache: CacheClient<Query, Variables, Result>;
  private fetcher: any;

  constructor(options: GraphQLClientOptions) {
    this.uri = options.uri;
    this.fetcher = options.fetch;
    this.cache = new CacheClient<Query, Variables, Result>();
  }

  fetch({
    query,
    variables
  }: {
    query: Query;
    variables: Variables;
  }): Promise<object> {
    return this.fetcher(this.uri, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables
      })
    }).then((response: Response) => response.json());
  }

  query(query: Query, variables: Variables) {
    const cachedData = this.cache.get(query, variables);
    if (cachedData) {
      return cachedData;
    }

    return this.fetch({ query: query, variables: variables }).then(result => {
      this.cache.set(query, variables, result);
      return result;
    });
  }
}

export default GraphQLClient;
