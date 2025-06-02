import { ApolloServer } from "@apollo/server";
import { Mora, MoraNode, tokenize } from "manimani";
import { startServerAndCreateLambdaHandler, handlers } from '@as-integrations/aws-lambda';
import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { ApolloServerPluginLandingPageLocalDefault } from "apollo-server-core";

type Status = "correct" | "incorrect" | "unanswered";

type MoraWithStatus =  Mora & {
    node: MoraNodeWithStatus[];
    status: Status;
}

type MoraNodeWithStatus =  MoraNode & {
    children: MoraNodeWithStatus[];
    status: Status;
}

const region = process.env.REGION ?? "ap-northeast-3";
const TableName = process.env.SENTENCE_TABLE_NAME ?? "Sentence-dev"
const client = new DynamoDBClient({region});
const getTypingThemeResolver = async(args: {id: number, level: number, difficulty: number}) => {
    const group = Math.round(args.difficulty * 10) / 10;
    const params: QueryCommandInput = {
        TableName,
        KeyConditionExpression: "#level = :level AND difficult_group = :difficult_group",
        FilterExpression: "#id <> :id",
        ExpressionAttributeNames: {
            "#level": "level",
            "#difficult_group": "difficult_group",
            "#id": "id"
        },
        ExpressionAttributeValues: {
            ":level": { S: args.level.toString() },
            ":difficult_group": { S: group.toString() },
            ":id": { S: args.id.toString() }
          },
        Limit: 100,
        ScanIndexForward: true
    }

    try {
        const data = await client.send(new QueryCommand(params));
        console.log("Query Result:", JSON.stringify(data, null, 2));
        if (!data.Items || data.Items.length == 0) throw new Error("result 0");

        const close = data.Items.reduce((a, b) => {
            const diffA = Number(a.difficult.N ?? "0");
            const diffB = Number(b.difficult.N ?? "0");
            return Math.abs(diffB - args.difficulty) < Math.abs(diffA - args.difficulty) ? b : a;
        })

        const id = close.id.N;
        const level = close.level.N;
        const difficult = close.difficult.N;
        const text = close.text.S;
        const ruby = close.ruby.S;
        if (!id || !level || !difficult || !text || !ruby) throw new Error(`missing value: id=${id}, level=${level}, difficult=${difficult}, text=${text}, ruby=${ruby}`);
        const moras = await toTokens({ text, ruby });
        const withStatus = toMoraWithStatus(moras);

        return {
            id: parseInt(id),
            text,
            ruby,
            moras: JSON.stringify(withStatus)
        };
    } catch (err) {
        console.error("getTypingTheme error:", err);
        throw new Error("Failed to get typing theme.");
    }
}

const toTokens = async(sentence: { text: string, ruby: string }): Promise<Mora[]> => {
    return await new Promise(resolve => {
        const dictionaryDir = process.env.DICTIONARY_DIR;
        if (!dictionaryDir) {
            throw new Error("DICTIONARY_DIR environment variable is not set.");
        }
        tokenize(dictionaryDir, sentence.ruby, (moras: Mora[]) => {
            resolve(moras);
        })
    });
};

const toMoraWithStatus = (moras: Mora[]): MoraWithStatus[] => {
    return moras.map((mora) => ({
        ...mora,
        status: "unanswered",
        node: toMoraNodeWithStatus(mora.node)
    }));
};

const toMoraNodeWithStatus = (nodes: MoraNode[]): MoraNodeWithStatus[] => {
    return nodes.map((node) => ({
        ...node,
        status: "unanswered",
        children: toMoraNodeWithStatus(node.children)
    }));
};

const resolvers = {
	Query: {
        getTypingTheme: async(_: any, args: { id: number, level: number, difficulty: number }) => {
            return getTypingThemeResolver(args);
       }
	}
};

const typeDefs = `#graphql
    type TypingTheme {
        id: Int!
        text: String!
        ruby: String!
        moras: String!
    }

    type Query {
        getTypingTheme(id: Int, level: Int!, difficulty: Float!): TypingTheme
    }

    query getTypingTheme($id: Int, $level: Int!, $difficulty: Float!) {
        getTypingTheme(id: $id, level: $level, difficulty: $difficulty) {
            id
            text
            ruby
            moras
        }
    }
`;

const server = new ApolloServer({
	typeDefs,
	resolvers
});

export const graphqlHandler = startServerAndCreateLambdaHandler(
	server,
	handlers.createAPIGatewayProxyEventRequestHandler()
);