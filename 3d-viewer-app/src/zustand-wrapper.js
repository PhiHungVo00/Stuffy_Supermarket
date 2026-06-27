import zustand from '../../node_modules/zustand';

const create = typeof zustand === 'function' ? zustand : (zustand.default || zustand);
const createStore = zustand.createStore || create?.createStore;
const useStore = zustand.useStore || create?.useStore;

export default create;
export { create, createStore, useStore };
