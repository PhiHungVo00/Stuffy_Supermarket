import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import Product from './models/Product';
import { getCachedData, cacheData, clearCache } from './redis';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
    description: String
    image: String
    category: String
    rating: Float
    numReviews: Int
    countInStock: Int
  }

  type Query {
    products(keyword: String, category: String, pageNumber: Int): ProductResponse!
    product(id: ID!): Product
  }

  type ProductResponse {
    products: [Product!]!
    page: Int!
    pages: Int!
    total: Int!
  }
`;

export const resolvers = {
  Product: {
    id: (parent: any) => parent._id || parent.id,
  },
  Query: {
    products: async (_: any, { keyword, category, pageNumber = 1 }: any) => {
      const cacheKey = `products:${keyword || 'all'}:${category || 'all'}:${pageNumber}`;
      
      // Try to get from Cache
      const cached = await getCachedData<any>(cacheKey);
      if (cached) return cached;

      const pageSize = 8;
      const query: any = {};
      
      if (keyword) {
        query.name = { $regex: keyword, $options: 'i' };
      }
      
      if (category && category !== 'All') {
        query.category = category;
      }

      const count = await Product.countDocuments(query);
      const products = await Product.find(query)
        .limit(pageSize)
        .skip(pageSize * (pageNumber - 1));

      const response = {
        products,
        page: pageNumber,
        pages: Math.ceil(count / pageSize),
        total: count
      };

      // Store in Cache for 300 seconds (5 mins)
      await cacheData(cacheKey, response, 300);

      return response;
    },
    product: async (_: any, { id }: any) => {
      const cacheKey = `product:${id}`;
      const cached = await getCachedData<any>(cacheKey);
      if (cached) return cached;
      
      const product = await Product.findById(id);
      if (product) {
        await cacheData(cacheKey, product, 3600);
      }
      return product;
    },
  },
};

export const schema = buildSubgraphSchema({ typeDefs, resolvers });
