import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import Product from './models/Product';
import { getCachedData, cacheData, clearCache } from './redis';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  type ProductVariant {
    id: ID!
    sku: String!
    size: String
    color: String
    storage: String
    price: Float!
    countInStock: Int!
    image: String
  }

  type Shop {
    id: ID!
    name: String!
    logo: String
    description: String
    rating: Float
  }

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
    description: String
    image: String
    images: [String]
    category: String
    rating: Float
    numReviews: Int
    countInStock: Int
    variants: [ProductVariant]
    shop: Shop
  }

  type Query {
    products(keyword: String, category: String, pageNumber: Int, minPrice: Float, maxPrice: Float, minRating: Float, sortBy: String): ProductResponse!
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
  Shop: {
    id: (parent: any) => parent._id || parent.id,
  },
  Query: {
    products: async (_: any, { keyword, category, pageNumber = 1, minPrice, maxPrice, minRating, sortBy }: any, context: any) => {
      const tenantId = context?.tenantId || 'default_store';
      const cacheKey = `products:${tenantId}:${keyword || 'all'}:${category || 'all'}:${pageNumber}:${minPrice || ''}:${maxPrice || ''}:${minRating || ''}:${sortBy || ''}`;
      
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

      if (minPrice !== undefined || maxPrice !== undefined) {
        query.price = {};
        if (minPrice !== undefined) query.price.$gte = minPrice;
        if (maxPrice !== undefined) query.price.$lte = maxPrice;
      }

      if (minRating !== undefined) {
        query.rating = { $gte: minRating };
      }

      query.tenantId = tenantId;

      let sortOption: any = { createdAt: -1 };
      switch (sortBy) {
        case 'price_asc': sortOption = { price: 1 }; break;
        case 'price_desc': sortOption = { price: -1 }; break;
        case 'rating': sortOption = { rating: -1 }; break;
        case 'newest': sortOption = { createdAt: -1 }; break;
        case 'popular': sortOption = { numReviews: -1 }; break;
      }

      const count = await Product.countDocuments(query);
      const products = await Product.find(query)
        .populate('variants')
        .populate('shop')
        .sort(sortOption)
        .limit(pageSize)
        .skip(pageSize * (pageNumber - 1));

      const response = {
        products,
        page: pageNumber,
        pages: Math.ceil(count / pageSize),
        total: count
      };

      await cacheData(cacheKey, response, 300);

      return response;
    },
    product: async (_: any, { id }: any, context: any) => {
      const tenantId = context?.tenantId || 'default_store';
      const cacheKey = `product:${tenantId}:${id}`;
      const cached = await getCachedData<any>(cacheKey);
      if (cached) return cached;
      
      const product = await Product.findOne({ _id: id, tenantId }).populate('variants').populate('shop');
      if (product) {
        await cacheData(cacheKey, product, 3600);
      }
      return product;
    },
  },
};

export const schema = buildSubgraphSchema({ typeDefs, resolvers });