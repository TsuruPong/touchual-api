import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { graphql, GraphQLSchema } from "graphql";
import { schema } from "./schema";
import { resolver } from "./resolver";

const allowOrigins = (process.env.ALLOW_ORIGINS || "").split(",");

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const origin = event.headers.origin || "";
  const isAllow = allowOrigins.includes(origin);

  // CORS Preflight (OPTIONS)
  if (event.requestContext.http.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": isAllow ? origin : "",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true"
      },
      body: ""
    };
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (err) {
    return {
      statusCode: 400,
      headers: corsHeaders(isAllow, origin),
      body: JSON.stringify({ error: "Invalid JSON body" })
    };
  }

  const { query, variables, operationName } = body;

  try {
    const result = await graphql({
      schema: schema as GraphQLSchema,
      source: query,
      variableValues: variables,
      operationName,
      rootValue: {
        getTypingTheme: resolver.theme
      }
    });

    return {
      statusCode: 200,
      headers: corsHeaders(isAllow, origin),
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error("GraphQL Execution Error", err);
    return {
      statusCode: 500,
      headers: corsHeaders(isAllow, origin),
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};

const corsHeaders = (isAllow: boolean, origin: string) => ({
  "Access-Control-Allow-Origin": isAllow ? origin : "",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json"
});
