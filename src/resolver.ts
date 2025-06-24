import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { toMoraWithStatus, toTokens } from "./tokenizer";

export const resolver = {
    theme: (args: {id: number, level: number, difficulty: number}) => getTypingTheme(args)
};

const getTypingTheme = async(args: {id: number, level: number, difficulty: number}) => {
    const region = process.env.REGION ?? "ap-northeast-3";
    const TableName = process.env.SENTENCE_TABLE_NAME ?? "Sentence-dev";
    const client = new DynamoDBClient({region});

    console.log(`id = ${args.id}, level = ${args.level}, difficulty = ${args.difficulty}`);

    const group = Math.round(args.difficulty * 10) / 10;

    const expressionAttributeNames: Record<string, string> = {
        "#level": "level",
        "#difficult_group": "difficult_group",
    };

    const expressionAttributeValues: Record<string, { N: string }> = {
        ":level": { N: args.level.toString() },
        ":difficult_group": { N: group.toString() },
    };

    let filterExpression: string | undefined;

    if (args.id !== undefined && args.id !== null) {
        expressionAttributeNames["#id"] = "id";
        expressionAttributeValues[":id"] = { N: args.id.toString() };
        filterExpression = "#id <> :id";
    }

    const params: QueryCommandInput = {
        TableName,
        IndexName: "level_difficult",
        KeyConditionExpression: "#level = :level AND #difficult_group = :difficult_group",
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(filterExpression && { FilterExpression: filterExpression }),
        Limit: 100,
        ScanIndexForward: true,
    };

    try {
        const data = await client.send(new QueryCommand(params));
        console.log(`Query Result: ${JSON.stringify(data, null, 2)}`);

        if (!data.Items || data.Items.length == 0) throw new Error("result 0");

        const close = data.Items.reduce((a, b) => {
            const diffA = Number(a.difficulty.N ?? "0");
            const diffB = Number(b.difficulty.N ?? "0");
            return Math.abs(diffB - args.difficulty) < Math.abs(diffA - args.difficulty) ? b : a;
        })

        const id = close.id.N;
        const level = close.level.N;
        const difficulty = close.difficulty.N;
        const text = close.text.S;
        const ruby = close.ruby.S;
        if (!id || !level || !difficulty || !text || !ruby) throw new Error(`missing value: id=${id}, level=${level}, difficult=${difficulty}, text=${text}, ruby=${ruby}`);
        const moras = await toTokens({ text, ruby });
        const withStatus = toMoraWithStatus(moras);
        
        console.log(`moras : ${withStatus}`);

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