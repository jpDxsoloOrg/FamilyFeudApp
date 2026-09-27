// Task 2.7 — GraphQL client (fetch for queries/mutations, AppSync realtime websocket for
// subscriptions). Reads VITE_GRAPHQL_URL / VITE_GRAPHQL_API_KEY.
export const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL as string | undefined;

export async function gql<T>(_query: string, _variables?: Record<string, unknown>): Promise<T> {
  throw new Error("Not implemented: gql (Task 2.7)");
}
