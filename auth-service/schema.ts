import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import User from './models/User';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  type User @key(fields: "id") {
    id: ID!
    name: String!
    email: String!
    role: String!
    coinsBalance: Int
  }

  type Query {
    me: User
    user(id: ID!): User
  }
`;

export const resolvers = {
  User: {
    id: (parent: any) => parent._id || parent.id,
    __resolveReference: async (reference: any) => {
      return await User.findById(reference.id);
    }
  },
  Query: {
    me: async (_: any, __: any, context: any) => {
      if (!context.userId) return null;
      return await User.findById(context.userId);
    },
    user: async (_: any, { id }: any) => {
      return await User.findById(id);
    }
  }
};

export const schema = buildSubgraphSchema({ typeDefs, resolvers });
