import { ApolloServer } from "@apollo/server";
import { Mora, MoraNode, tokenize } from "manimani";
import { startServerAndCreateLambdaHandler, handlers } from '@as-integrations/aws-lambda';
import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";

type Status = "correct" | "incorrect" | "unanswered";

type MoraWithStatus =  Mora & {
    node: MoraNodeWithStatus[];
    status: Status;
}

type MoraNodeWithStatus =  MoraNode & {
    children: MoraNodeWithStatus[];
    status: Status;
}

const client = new DynamoDBClient({region: "ap-noatheast-1"});
const getTypingThemeResolver = async(args: {id: number, level: number, difficulty: number}) => {
    const group = Math.round(args.difficulty * 10) / 10;
    const params: QueryCommandInput = {
        TableName: "sentence",
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

        // TODO difficultに近い値を一件取得
        // TODO morawithstatusに変換
        // TODO レスポンスの生成
        // TODO テーブルの作成と初期データの投入方法を考える

        return { id: 1, text: "", ruby: "row.ruby", moras: {} };
    } catch(err) {
        // TODO レスポンスの生成
        return {
            status: 500
        }
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
	handlers.createAPIGatewayProxyEventV2RequestHandler()
);