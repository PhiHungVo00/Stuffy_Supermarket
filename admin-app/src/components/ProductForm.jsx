import React, { useState, useEffect } from "react";

const emptyVariant = () => ({ sku: '', price: '', countInStock: '', color: '', size: '', storage: '' });

const ProductForm = ({ onAdd, onUpdate, editing }) => {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Laptops");
  const [images, setImages] = useState([""]);
  const [variants, setVariants] = useState([]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPrice(editing.price);
      setDescription(editing.description || "");
      setCategory(editing.category || "Laptops");
      setImages(editing.images && editing.images.length > 0 ? editing.images : [editing.image || ""]);
      setVariants(
        editing.variants && editing.variants.length > 0
          ? editing.variants.map(v => ({
              sku: v.sku || '',
              price: v.price || '',
              countInStock: v.countInStock ?? '',
              color: v.attributes?.color || '',
              size: v.attributes?.size || '',
              storage: v.attributes?.storage || '',
            }))
          : []
      );
    }
  }, [editing]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !price) return;

    const filteredImages = images.filter(url => url.trim() !== '');
    const formattedVariants = variants
      .filter(v => v.sku.trim() !== '')
      .map(v => ({
        sku: v.sku,
        price: Number(v.price) || Number(price),
        countInStock: Number(v.countInStock) || 0,
        attributes: {
          ...(v.color && { color: v.color }),
          ...(v.size && { size: v.size }),
          ...(v.storage && { storage: v.storage }),
        },
      }));

    const product = {
      id: editing ? editing.id : null,
      name,
      price: Number(price),
      description,
      category,
      image: filteredImages[0] || '',
      images: filteredImages,
      variants: formattedVariants,
    };

    editing ? onUpdate(product) : onAdd(product);

    setName("");
    setPrice("");
    setDescription("");
    setCategory("Laptops");
    setImages([""]);
    setVariants([]);
  };

  const addImageField = () => setImages([...images, ""]);
  const removeImageField = (idx) => setImages(images.filter((_, i) => i !== idx));
  const updateImage = (idx, value) => {
    const updated = [...images];
    updated[idx] = value;
    setImages(updated);
  };

  const addVariant = () => setVariants([...variants, emptyVariant()]);
  const removeVariant = (idx) => setVariants(variants.filter((_, i) => i !== idx));
  const updateVariant = (idx, field, value) => {
    const updated = [...variants];
    updated[idx] = { ...updated[idx], [field]: value };
    setVariants(updated);
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

  const smallInputStyle = {
    ...inputStyle,
    padding: '8px 12px',
    fontSize: '0.88rem',
    marginBottom: '8px',
  };

  const sectionLabel = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '0.88rem',
    fontWeight: '600',
    color: 'var(--text-muted)',
  };

  const removeBtnStyle = {
    background: '#fef2f2',
    color: '#ef4444',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: '600',
  };

  return (
    <div className="ds-glass-card" style={{ position: 'sticky', top: '120px' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '800' }}>
        {editing ? 'Edit Product' : 'Add New Product'}
      </h3>
      
      <form onSubmit={handleSubmit}>
        <label style={sectionLabel}>Product Name</label>
        <input
          placeholder="e.g. Sony WH-1000XM5"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />
        
        <label style={sectionLabel}>Price (USD)</label>
        <input
          placeholder="e.g. 349"
          value={price}
          type="number"
          onChange={e => setPrice(e.target.value)}
          style={inputStyle}
        />

        <label style={sectionLabel}>Description</label>
        <textarea
          placeholder="Product details..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        />

        <label style={sectionLabel}>Category</label>
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
          <option value="Tech">Tech</option>
        </select>

        {/* Image URLs */}
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...sectionLabel, marginBottom: 0 }}>Image URLs</label>
            <button type="button" onClick={addImageField} style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
              + Add Image
            </button>
          </div>
          {images.map((url, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                placeholder={`Image URL ${idx + 1}`}
                value={url}
                onChange={e => updateImage(idx, e.target.value)}
                style={{ ...smallInputStyle, flex: 1 }}
              />
              {images.length > 1 && (
                <button type="button" onClick={() => removeImageField(idx)} style={removeBtnStyle}>×</button>
              )}
            </div>
          ))}
        </div>

        {/* Variants */}
        <div style={{ marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...sectionLabel, marginBottom: 0 }}>Variants</label>
            <button type="button" onClick={addVariant} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}>
              + Add Variant
            </button>
          </div>
          {variants.map((v, idx) => (
            <div key={idx} style={{ background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-muted)' }}>Variant #{idx + 1}</span>
                <button type="button" onClick={() => removeVariant(idx)} style={removeBtnStyle}>Remove</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input placeholder="SKU *" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} style={smallInputStyle} />
                <input placeholder="Price" type="number" value={v.price} onChange={e => updateVariant(idx, 'price', e.target.value)} style={smallInputStyle} />
                <input placeholder="Stock" type="number" value={v.countInStock} onChange={e => updateVariant(idx, 'countInStock', e.target.value)} style={smallInputStyle} />
                <input placeholder="Color" value={v.color} onChange={e => updateVariant(idx, 'color', e.target.value)} style={smallInputStyle} />
                <input placeholder="Size" value={v.size} onChange={e => updateVariant(idx, 'size', e.target.value)} style={smallInputStyle} />
                <input placeholder="Storage" value={v.storage} onChange={e => updateVariant(idx, 'storage', e.target.value)} style={smallInputStyle} />
              </div>
            </div>
          ))}
        </div>

        <button type="submit" className="ds-button" style={{ width: '100%', marginTop: '10px' }}>
          {editing ? 'Save Changes' : 'Add Product'}
        </button>
      </form>
    </div>
  );
};

export default ProductForm;
