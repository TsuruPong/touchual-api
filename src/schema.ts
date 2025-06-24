import { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLFloat, GraphQLString, GraphQLNonNull } from "graphql";
import { resolver } from "./resolver";

export const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      getTypingTheme: {
        type: new GraphQLObjectType({
          name: "TypingTheme",
          fields: {
            id: { type: new GraphQLNonNull(GraphQLInt) },
            text: { type: new GraphQLNonNull(GraphQLString) },
            ruby: { type: new GraphQLNonNull(GraphQLString) },
            moras: { type: new GraphQLNonNull(GraphQLString) }
          }
        }),
        args: {
          id: { type: GraphQLInt },
          level: { type: new GraphQLNonNull(GraphQLInt) },
          difficulty: { type: new GraphQLNonNull(GraphQLFloat) }
        },
        resolve: (_parent, args) => resolver.theme(args)
      }
    }
  })
});
