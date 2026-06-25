import { Product, User } from "@stuffy/types";

const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');

const BASE_URL = isProduction 
  ? "https://stuffy-backend-api-xmln.onrender.com/api" 
  : "http://localhost:5000/api";

const GRAPHQL_URL = isProduction 
  ? "https://stuffy-graphql-gateway-xmln.onrender.com/graphql" 
  : "http://localhost:4000/graphql";

const apiRequest = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  let authHeader = {};
  if (typeof window !== 'undefined') {
    const userInfoString = localStorage.getItem('userInfo');
    if (userInfoString) {
      try {
        const { token } = JSON.parse(userInfoString);
        if (token) {
          authHeader = { 'Authorization': `Bearer ${token}` };
        }
      } catch (e) {}
    }
  }

  const settings = {
    ...options,
    credentials: 'include' as const,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...options.headers,
    },
  };

  const response = await fetch(`${BASE_URL}${url}`, settings);
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }
  
  return data as T;
};

const graphqlRequest = async <T>(query: string, variables: any = {}): Promise<T> => {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const { data, errors } = await response.json();
  if (errors) throw new Error(errors[0].message);
  return data as T;
};

export const authApi = {
  login: (email: string, password: string): Promise<{ user: User }> => 
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string, role?: string): Promise<{ user: User }> => 
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    }),
  logout: (): Promise<{ message: string }> => 
    apiRequest('/auth/logout', {
      method: 'POST',
    }),
  me: (): Promise<User> => apiRequest('/auth/me'),
};

export const productApi = {
  getAll: (keyword = '', page = 1, category = 'All'): Promise<{ products: Product[], pages: number, total: number }> => 
    apiRequest(`/products?keyword=${keyword}&pageNumber=${page}&category=${category}`),
  
  getAllFiltered: (keyword = '', page = 1, category = 'All', sortBy = 'newest', minPrice = '', maxPrice = ''): Promise<{ products: Product[], pages: number, total: number, categories: string[] }> => {
    let url = `/products?keyword=${keyword}&pageNumber=${page}&category=${category}&sortBy=${sortBy}`;
    if (minPrice) url += `&minPrice=${minPrice}`;
    if (maxPrice) url += `&maxPrice=${maxPrice}`;
    return apiRequest(url);
  },
  
  getAllGraphQL: async (keyword = '', page = 1, category = 'All'): Promise<{ products: Product[], pages: number, total: number }> => {
    const query = `
      query GetProducts($keyword: String, $page: Int, $category: String) {
        products(keyword: $keyword, pageNumber: $page, category: $category) {
          products {
            id
            name
            price
            description
            image
            category
            rating
            numReviews
            countInStock
            shop {
              id
              name
              logo
              description
              rating
            }
          }
          page
          pages
          total
        }
      }
    `;
    const data = await graphqlRequest<{ products: any }> (query, { keyword, page, category });
    return data.products;
  },
  getById: (id: string): Promise<Product> => apiRequest(`/products/${id}`),
  create: (product: Partial<Product>): Promise<Product> => apiRequest('/products', {
    method: 'POST',
    body: JSON.stringify(product),
  }),
  update: (id: string, product: Partial<Product>): Promise<Product> => apiRequest(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(product),
  }),
  delete: (id: string): Promise<void> => apiRequest(`/products/${id}`, {
    method: 'DELETE',
  }),
  addReview: (id: string, rating: number, comment: string): Promise<void> => apiRequest(`/products/${id}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  }),
};

export const cartApi = {
  getCart: (): Promise<{ cartItems: any[] }> => apiRequest('/cart'),
  syncCart: (cartItems: any[]): Promise<void> => apiRequest('/cart', {
    method: 'POST',
    body: JSON.stringify({ cartItems }),
  }),
};

export const orderApi = {
  create: (order: any): Promise<any> => apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  }),
  getById: (id: string): Promise<any> => apiRequest(`/orders/${id}`),
  getMyOrders: (): Promise<any[]> => apiRequest('/orders/myorders'),
  getAll: (page = 1, status = ''): Promise<any> => apiRequest(`/orders?page=${page}${status ? `&status=${status}` : ''}`),
  updateStatus: (id: string, status: string): Promise<any> => apiRequest(`/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),
};

export const voucherApi = {
  getAll: (): Promise<any[]> => apiRequest('/vouchers'),
  claim: (code: string): Promise<any> => apiRequest('/vouchers/claim', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }),
  apply: (code: string, orderTotal: number): Promise<any> => apiRequest('/vouchers/apply', {
    method: 'POST',
    body: JSON.stringify({ code, orderTotal }),
  }),
};

export const addressApi = {
  getAll: (): Promise<any[]> => apiRequest('/addresses'),
  create: (address: any): Promise<any> => apiRequest('/addresses', {
    method: 'POST',
    body: JSON.stringify(address),
  }),
  update: (id: string, address: any): Promise<any> => apiRequest(`/addresses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(address),
  }),
  delete: (id: string): Promise<void> => apiRequest(`/addresses/${id}`, {
    method: 'DELETE',
  }),
};

export const categoryApi = {
  getAll: (): Promise<any> => apiRequest('/categories'),
  create: (category: any): Promise<any> => apiRequest('/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  }),
  update: (id: string, category: any): Promise<any> => apiRequest(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(category),
  }),
  delete: (id: string): Promise<void> => apiRequest(`/categories/${id}`, {
    method: 'DELETE',
  }),
};
