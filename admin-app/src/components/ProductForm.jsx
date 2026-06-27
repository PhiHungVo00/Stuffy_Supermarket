import React, { useState, useEffect } from "react";
// @ts-ignore
import { useI18nStore } from "store/i18n";

const ProductForm = ({ onAdd, onUpdate, editing }) => {
  const { t } = useI18nStore();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Laptops");
  const [weight, setWeight] = useState(200);
  const [image, setImage] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPrice(editing.price);
      setDescription(editing.description || "");
      setCategory(editing.category || "Laptops");
      setWeight(editing.weight || 200);
      setImage(editing.image || "");
    }
  }, [editing]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !price) return;

    const product = {
      id: editing ? (editing._id || editing.id) : null,
      name,
      price: Number(price),
      description,
      category,
      weight: Number(weight || 200),
      image,
    };

    editing ? onUpdate(product) : onAdd(product);

    setName("");
    setPrice("");
    setDescription("");
    setCategory("Laptops");
    setWeight(200);
    setImage("");
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
        {editing ? t('admin_edit_product') : t('admin_add_new_product')}
      </h3>
      
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_product_name')}</label>
        <input
          placeholder="e.g. Sony WH-1000XM5"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
          required
        />
        
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_price_usd')}</label>
        <input
          placeholder="e.g. 349"
          value={price}
          type="number"
          onChange={e => setPrice(e.target.value)}
          style={inputStyle}
          required
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_description')}</label>
        <textarea
          placeholder="Product details..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_weight_grams')}</label>
        <input
          placeholder="e.g. 200"
          value={weight}
          type="number"
          onChange={e => setWeight(e.target.value)}
          style={inputStyle}
        />

        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_category')}</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={inputStyle}
        >
          <option value="Laptops">{t('admin_cat_laptops')}</option>
          <option value="Phones">{t('admin_cat_phones')}</option>
          <option value="Audio">{t('admin_cat_audio')}</option>
          <option value="Gaming">{t('admin_cat_gaming')}</option>
          <option value="Video">{t('admin_cat_video')}</option>
          <option value="Accessories">{t('admin_cat_accessories')}</option>
        </select>

        {/* 📷 Trường Upload hình ảnh mới */}
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_product_image')}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload} 
              id="file-upload-input"
              style={{ display: 'none' }}
            />
            <label 
              htmlFor="file-upload-input" 
              className="ds-button"
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px', 
                padding: '10px 16px', 
                background: '#f1f5f9', 
                color: 'var(--text-main)', 
                border: '1px solid var(--border-light)', 
                borderRadius: '8px', 
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.88rem',
                width: '100%',
                boxSizing: 'border-box',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}
            >
              📷 {t('admin_upload_image')}
            </label>
          </div>
          <input
            placeholder={t('admin_image_url_placeholder')}
            value={image}
            onChange={e => setImage(e.target.value)}
            style={{ ...inputStyle, marginBottom: 0 }}
          />
        </div>

        {/* Xem trước ảnh (Image Preview) */}
        {image && (
          <div style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed var(--border-light)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>{t('admin_image_preview')}</span>
            <img 
              src={image} 
              alt="Preview" 
              style={{ width: '100%', maxHeight: '150px', objectFit: 'contain', borderRadius: '6px' }} 
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        <button type="submit" className="ds-button" style={{ width: '100%', marginTop: '10px' }}>
          {editing ? t('admin_save_changes') : t('admin_add_product')}
        </button>
      </form>
    </div>
  );
};

export default ProductForm;