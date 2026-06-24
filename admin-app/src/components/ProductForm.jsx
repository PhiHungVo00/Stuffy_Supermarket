import React, { useState, useEffect } from "react";

const ProductForm = ({ onAdd, onUpdate, editing }) => {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Laptops");
  const [weight, setWeight] = useState(200);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPrice(editing.price);
      setDescription(editing.description || "");
      setCategory(editing.category || "Laptops");
      setWeight(editing.weight || 200);
    }
  }, [editing]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !price) return;

    const product = {
      id: editing ? editing.id : null,
      name,
      price: Number(price),
      description,
      category,
    };

    editing ? onUpdate(product) : onAdd(product);

    setName("");
    setPrice("");
    setDescription("");
    setCategory("Laptops");
    setWeight(200);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border-light)',
    background: '#f8fafc',
    marginBottom: '15px',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box'
  };

  return (
    <div className="ds-glass-card" style={{ position: 'sticky', top: '120px' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '800' }}>
        {editing ? 'Edit Product' : 'Add New Product'}
      </h3>
      
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>Product Name</label>
        <input
          placeholder="e.g. Sony WH-1000XM5"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />
        
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>Price (USD)</label>
        <input
          placeholder="e.g. 349"
          value={price}
          type="number"
          onChange={e => setPrice(e.target.value)}
          style={inputStyle}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>Description</label>
        <textarea
          placeholder="Product details..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>Weight (grams)</label>
        <input
          placeholder="e.g. 200"
          value={weight}
          type="number"
          onChange={e => setWeight(e.target.value)}
          style={inputStyle}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={inputStyle}
        >
          <option value="Laptops">Laptops</option>
          <option value="Phones">Phones</option>
          <option value="Audio">Audio</option>
          <option value="Gaming">Gaming</option>
          <option value="Video">Video</option>
          <option value="Accessories">Accessories</option>
        </select>

        <button type="submit" className="ds-button" style={{ width: '100%', marginTop: '10px' }}>
          {editing ? 'Save Changes' : 'Add Product'}
        </button>
      </form>
    </div>
  );
};

export default ProductForm;