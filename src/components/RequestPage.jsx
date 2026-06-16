import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, AlertCircle, CheckCircle2, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';

// Format Case Number as ERMS-YYYYMMDD-XX (e.g. ERMS-20260610-BA)
const formatCaseNumber = (id, createdAt) => {
  const date = new Date(createdAt || new Date());
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  
  const idVal = Number(id || 0);
  const char1 = String.fromCharCode(65 + (idVal % 26));
  const char2 = String.fromCharCode(65 + (Math.floor(idVal / 26) % 26));
  
  return `ERMS-${dateStr}-${char1}${char2}`;
};

export default function RequestPage() {
  const [resources, setResources] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  
  // Cart state
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);
  
  // Submitted request IDs
  const [submittedIds, setSubmittedIds] = useState([]);
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    empId: '',
    dept: '',
    email: '',
    requiredDate: '',
    courseName: '',
    targetAudience: '',
    expectedReturnDate: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch teaching aids
      const { data: aidsData, error: aidsError } = await supabase
        .from('teaching_aids')
        .select('*')
        .order('id', { ascending: true });
      if (aidsError) throw aidsError;

      // Fetch active borrow requests to calculate current availability
      const { data: reqsData, error: reqsError } = await supabase
        .from('borrow_requests')
        .select('*');
      if (reqsError) throw reqsError;

      setResources(aidsData || []);
      setRequests(reqsData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate dynamic available quantity for a specific aid
  const getAvailableQty = (aid) => {
    const borrowedQty = requests
      .filter(r => r.resource_id === aid.id && r.status === 'approved')
      .reduce((sum, r) => sum + (r.quantity || 1), 0);
    return Math.max(0, aid.quantity - borrowedQty);
  };

  // Helper to compute min required date (> 3 working days)
  const getMinSelectableDate = () => {
    let date = new Date();
    let workingDaysAdded = 0;
    while (workingDaysAdded < 3) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) { // Skip Sunday (0) and Saturday (6)
        workingDaysAdded++;
      }
    }
    date.setDate(date.getDate() + 1);
    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Cart Functions
  const addToCart = (item) => {
    const available = getAvailableQty(item);
    if (available <= 0) return;

    setCart(prevCart => {
      const existing = prevCart.find(cartItem => cartItem.id === item.id);
      if (existing) {
        // Enforce stock limit
        if (existing.quantity >= available) {
          alert(`已達庫存上限：該教具目前可借用數量為 ${available} ${item.unit || '具'}`);
          return prevCart;
        }
        return prevCart.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      } else {
        return [...prevCart, {
          id: item.id,
          name: item.name,
          brand: item.brand,
          model: item.model,
          unit: item.unit || '具',
          image_url: item.image_url,
          quantity: 1,
          maxAvailable: available
        }];
      }
    });
    
    setCheckoutSuccess(false);
  };

  const removeFromCart = (itemId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  const updateCartQty = (itemId, change) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.id === itemId) {
          const newQty = item.quantity + change;
          if (newQty <= 0) {
            // Remove item if quantity goes to 0
            return null;
          }
          if (newQty > item.maxAvailable) {
            alert(`已達庫存上限：該教具目前可借用數量為 ${item.maxAvailable} ${item.unit}`);
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const validateForm = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = '請輸入姓名';
    if (!form.phone.trim()) {
      newErrors.phone = '請輸入手機電話';
    } else if (!/^\d{10}$/.test(form.phone.trim().replace(/[- ]/g, ''))) {
      newErrors.phone = '手機格式有誤，需為 10 位數字';
    }
    if (!form.empId.trim()) newErrors.empId = '請輸入員工編號';
    if (!form.dept.trim()) newErrors.dept = '請輸入申請單位';
    
    if (!form.email.trim()) {
      newErrors.email = '請輸入電子信箱';
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = '信箱格式有誤';
    }
    
    if (!form.requiredDate) {
      newErrors.requiredDate = '請選擇需求日期';
    } else {
      const selected = new Date(form.requiredDate);
      const minDate = new Date(getMinSelectableDate());
      selected.setHours(0,0,0,0);
      minDate.setHours(0,0,0,0);
      if (selected < minDate) {
        newErrors.requiredDate = `需求日期必須大於三個工作天 (最早可選: ${getMinSelectableDate()})`;
      }
    }

    if (!form.courseName.trim()) newErrors.courseName = '請輸入課程名稱';
    if (!form.targetAudience.trim()) newErrors.targetAudience = '請輸入使用對象';
    if (!form.expectedReturnDate) {
      newErrors.expectedReturnDate = '請選擇預計歸還日期';
    } else if (form.requiredDate && new Date(form.expectedReturnDate) < new Date(form.requiredDate)) {
      newErrors.expectedReturnDate = '歸還日期不能早於需求日期';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('您的租借車是空的，請先加入器材。');
      return;
    }
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      
      // Batch insert into borrow_requests
      const inserts = cart.map(item => ({
        resource_id: item.id,
        applicant_name: form.name,
        applicant_phone: form.phone,
        applicant_emp_id: form.empId,
        applicant_dept: form.dept,
        applicant_email: form.email,
        required_date: form.requiredDate,
        course_name: form.courseName,
        target_audience: form.targetAudience,
        expected_return_date: form.expectedReturnDate,
        quantity: item.quantity,
        status: 'pending'
      }));

      const { data, error } = await supabase
        .from('borrow_requests')
        .insert(inserts)
        .select('id');

      if (error) throw error;
      
      if (data) {
        setSubmittedIds(data.map(r => r.id));
        
        // Trigger webhook
        try {
          await fetch('https://n8nwfh.zeabur.app/webhook/order_bulid', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              request_ids: data.map(r => r.id),
              applicant: form,
              items: cart
            })
          });
        } catch (webhookErr) {
          console.error('Webhook trigger failed:', webhookErr);
          // Continue execution even if webhook fails
        }
      }
      setCheckoutSuccess(true);
      setCart([]); // Clear cart
      // Refresh requests data
      await fetchData();
    } catch (err) {
      console.error('Error submitting batch request:', err);
      alert('提交申請失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter and search logic (Only show is_active !== false)
  const filteredResources = resources
    .filter(item => item.is_active !== false)
    .filter(item => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.remarks && item.remarks.toLowerCase().includes(searchTerm.toLowerCase()));
        
      const matchesBrand = selectedBrand === '' || item.brand === selectedBrand;
      
      return matchesSearch && matchesBrand;
    });

  const brands = [...new Set(resources.map(r => r.brand).filter(Boolean))];
  const totalCartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (loading && resources.length === 0) {
    return (
      <div className="spinner-wrapper">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1>器材租借申請</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <span>共有 {filteredResources.length} 款器材可供選擇</span>
        </div>
      </div>
      <p className="subtitle">選擇您需要借用的臨床技能教具，點擊「加入租借車」。完成選擇後，點擊右下角租借車填寫資料一次送出。</p>

      {/* Search & Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="搜尋器材名稱、廠牌、規格、型號或備註..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select
          className="select-filter"
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
        >
          <option value="">所有廠牌</option>
          {brands.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Cards Grid */}
      {filteredResources.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <h3>找不到符合條件的器材</h3>
          <p>請嘗試其他搜尋字詞或重設廠牌篩選器。</p>
        </div>
      ) : (
        <div className="cards-grid" style={{ marginBottom: '5rem' }}>
          {filteredResources.map(item => {
            const available = getAvailableQty(item);
            const inCartItem = cart.find(c => c.id === item.id);
            const inCartQty = inCartItem ? inCartItem.quantity : 0;
            const remainingToBorrow = available - inCartQty;

            const total = item.quantity;
            let badgeClass = 'badge-available';
            let badgeText = '設備充足';
            
            if (available === 0) {
              badgeClass = 'badge-out';
              badgeText = '無可借用';
            } else if (available / total <= 0.5) {
              badgeClass = 'badge-low';
              badgeText = '庫存緊張';
            }

            return (
              <div key={item.id} className="item-card">
                <div 
                  className="card-image-wrapper" 
                  onClick={() => setLightboxImage(item.image_url)}
                  style={{ cursor: 'zoom-in' }}
                  title="點選放大圖片"
                >
                  <img
                    className="card-image"
                    src={item.image_url || '/images/vite.svg'}
                    alt={item.name}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60';
                    }}
                  />
                  <span className={`card-badge ${badgeClass}`}>{badgeText}</span>
                </div>
                <div className="card-content">
                  <h3 className="card-title" title={item.name}>{item.name}</h3>
                  <div className="card-meta">
                    <div>
                      <span>廠牌:</span>
                      <span>{item.brand || 'N/A'}</span>
                    </div>
                    <div>
                      <span>型號:</span>
                      <span>{item.model || 'N/A'}</span>
                    </div>
                    <div>
                      <span>可用數量 / 總量:</span>
                      <span style={{ fontWeight: 700, color: available > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {available} / {item.quantity} {item.unit}
                      </span>
                    </div>
                    {inCartQty > 0 && (
                      <div style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                        租借車中已加入: {inCartQty} {item.unit}
                      </div>
                    )}
                    {item.remarks && (
                      <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>
                        <strong>備註:</strong> {item.remarks}
                      </div>
                    )}
                  </div>
                  {available === 0 ? (
                    <button className="card-btn" disabled>目前無庫存</button>
                  ) : inCartQty === 0 ? (
                    <button className="card-btn" onClick={() => addToCart(item)}>加入租借車</button>
                  ) : (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      background: 'rgba(14, 165, 233, 0.1)', 
                      borderRadius: 'var(--radius-sm)', 
                      border: '1px solid var(--primary)', 
                      overflow: 'hidden', 
                      height: '40px' 
                    }}>
                      <button 
                        type="button"
                        className="cart-qty-btn" 
                        onClick={() => updateCartQty(item.id, -1)}
                        style={{ width: '40px', height: '100%', borderRadius: 0, border: 'none', background: 'none', color: 'var(--primary)' }}
                        title="減少數量"
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontWeight: 700, color: 'var(--primary-hover)', fontSize: '0.9rem' }}>
                        已選: {inCartQty} {item.unit || '具'}
                      </span>
                      <button 
                        type="button"
                        className="cart-qty-btn" 
                        onClick={() => updateCartQty(item.id, 1)}
                        disabled={remainingToBorrow <= 0}
                        style={{ 
                          width: '40px', 
                          height: '100%', 
                          borderRadius: 0, 
                          border: 'none', 
                          background: 'none', 
                          color: 'var(--primary)', 
                          cursor: remainingToBorrow <= 0 ? 'not-allowed' : 'pointer', 
                          opacity: remainingToBorrow <= 0 ? 0.3 : 1 
                        }}
                        title="增加數量"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Cart Button */}
      <button 
        className={`cart-floating-btn ${totalCartItemsCount > 0 ? 'pulse' : ''}`}
        onClick={() => {
          setCartOpen(true);
          setCheckoutSuccess(false);
        }}
        title="查看租借車"
      >
        <ShoppingCart size={28} />
        {totalCartItemsCount > 0 && (
          <span className="cart-btn-badge">{totalCartItemsCount}</span>
        )}
      </button>

      {/* Cart Sidebar Panel */}
      {cartOpen && (
        <div className="cart-sidebar-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="cart-sidebar-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart size={22} style={{ color: 'var(--primary)' }} />
                租借申請車
              </h3>
              <button className="modal-close" onClick={() => setCartOpen(false)} style={{ fontSize: '1.5rem' }}>
                &times;
              </button>
            </div>
            
            <div className="cart-sidebar-body">
              {checkoutSuccess ? (
                /* SUCCESS SCREEN */
                <div className="empty-state" style={{ padding: '3rem 0' }}>
                  <CheckCircle2 size={64} style={{ color: 'var(--success)' }} />
                  <h2 style={{ color: 'var(--success)', marginTop: '1rem' }}>租借申請成功！</h2>
                  
                  <div style={{ margin: '1.5rem 0', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)', width: '100%' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>您的案件申請編號：</span>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.4rem', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                      {submittedIds.length > 0 ? formatCaseNumber(Math.min(...submittedIds)) : ''}
                    </div>
                  </div>

                  <p style={{ margin: '0.5rem 0 1.5rem', lineHeight: '1.4', fontSize: '0.9rem' }}>您的批量租借申請已成功提交至教學部。</p>
                  <p className="helper-text" style={{ marginBottom: '2rem', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    請等待管理人員審核。您可前往「租借狀態看板」，以申請人姓名或上述【案件編號】查詢處理進度。
                  </p>
                  <button className="btn-primary" onClick={() => setCartOpen(false)}>
                    關閉視窗
                  </button>
                </div>
              ) : (
                /* CHECKOUT FORM & ITEMS */
                <>
                  {cart.length === 0 ? (
                    <div className="empty-state" style={{ padding: '4rem 1rem', fontSize: '0.9rem' }}>
                      <ShoppingCart size={48} />
                      <p>租借車目前是空的</p>
                      <span className="helper-text">請先將器材「加入租借車」</span>
                    </div>
                  ) : (
                    <form onSubmit={handleCheckoutSubmit}>
                      {/* 1. Applicant Info Form (ON TOP) */}
                      <div className="applicant-info-section" style={{ marginBottom: '2rem' }}>
                        <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          申請人基本資料
                        </h4>
                        
                        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                          <div className="form-group">
                            <label>姓名 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="請輸入姓名"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                              required
                            />
                            {errors.name && <span className="error-text">{errors.name}</span>}
                          </div>

                          <div className="form-group">
                            <label>手機電話 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="例如: 0912345678"
                              value={form.phone}
                              onChange={(e) => setForm({ ...form, phone: e.target.value })}
                              required
                            />
                            {errors.phone && <span className="error-text">{errors.phone}</span>}
                          </div>

                          <div className="form-group">
                            <label>員工編號 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="請輸入工號"
                              value={form.empId}
                              onChange={(e) => setForm({ ...form, empId: e.target.value })}
                              required
                            />
                            {errors.empId && <span className="error-text">{errors.empId}</span>}
                          </div>

                          <div className="form-group">
                            <label>申請單位 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="例如: 急診醫學部"
                              value={form.dept}
                              onChange={(e) => setForm({ ...form, dept: e.target.value })}
                              required
                            />
                            {errors.dept && <span className="error-text">{errors.dept}</span>}
                          </div>

                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>電子信箱 *</label>
                            <input
                              type="email"
                              className="input-field"
                              placeholder="例如: applicant@hospital.org.tw"
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                              required
                            />
                            {errors.email && <span className="error-text">{errors.email}</span>}
                          </div>

                          <div className="form-group">
                            <label>課程名稱 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="請輸入課程名稱"
                              value={form.courseName}
                              onChange={(e) => setForm({ ...form, courseName: e.target.value })}
                              required
                            />
                            {errors.courseName && <span className="error-text">{errors.courseName}</span>}
                          </div>

                          <div className="form-group">
                            <label>使用對象 *</label>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="例如: 實習醫學生"
                              value={form.targetAudience}
                              onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                              required
                            />
                            {errors.targetAudience && <span className="error-text">{errors.targetAudience}</span>}
                          </div>

                          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                            <label>需求日期 *</label>
                            <input
                              type="date"
                              className="input-field"
                              min={getMinSelectableDate()}
                              value={form.requiredDate}
                              onChange={(e) => setForm({ ...form, requiredDate: e.target.value })}
                              required
                            />
                            <span className="helper-text" style={{ fontSize: '0.7rem' }}>
                              最早可借: {getMinSelectableDate()}
                            </span>
                            {errors.requiredDate && <span className="error-text">{errors.requiredDate}</span>}
                          </div>

                          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                            <label>預計歸還日期 *</label>
                            <input
                              type="date"
                              className="input-field"
                              min={form.requiredDate || getMinSelectableDate()}
                              value={form.expectedReturnDate}
                              onChange={(e) => setForm({ ...form, expectedReturnDate: e.target.value })}
                              required
                            />
                            <span className="helper-text" style={{ fontSize: '0.7rem', opacity: 0 }}>保持對齊</span>
                            {errors.expectedReturnDate && <span className="error-text">{errors.expectedReturnDate}</span>}
                          </div>
                        </div>
                      </div>

                      {/* 2. Cart Items List (AT THE BOTTOM) */}
                      <div className="cart-items-section" style={{ marginBottom: '2rem' }}>
                        <h4 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                          已選擇器材 ({cart.length} 款)
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {cart.map(item => (
                            <div key={item.id} className="cart-item-row">
                              <img
                                className="cart-item-thumb"
                                src={item.image_url}
                                alt=""
                                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=100'; }}
                                onClick={() => setLightboxImage(item.image_url)}
                                style={{ cursor: 'zoom-in' }}
                                title="點選放大圖片"
                              />
                              <div className="cart-item-info">
                                <div className="cart-item-name">{item.name}</div>
                                <div className="cart-item-desc">
                                  廠牌: {item.brand || 'N/A'} | 型號: {item.model || 'N/A'}
                                </div>
                                <div className="cart-item-controls" style={{ marginTop: '0.5rem' }}>
                                  <button
                                    type="button"
                                    className="cart-qty-btn"
                                    onClick={() => updateCartQty(item.id, -1)}
                                    title="減少數量"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="cart-qty-val" style={{ margin: '0 0.5rem', fontSize: '0.85rem' }}>
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="cart-qty-btn"
                                    onClick={() => updateCartQty(item.id, 1)}
                                    title="增加數量"
                                  >
                                    <Plus size={12} />
                                  </button>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                                    (庫存剩餘: {item.maxAvailable})
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="cart-remove-btn"
                                onClick={() => removeFromCart(item.id)}
                                title="移除此項目"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 3. Batch Submit Button */}
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={submitting}
                        style={{ marginTop: '1rem' }}
                      >
                        {submitting ? '提交申請中...' : `確認並一次送出 (${cart.length} 項器材)`}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div className="modal-overlay" onClick={() => setLightboxImage(null)} style={{ zIndex: 2000 }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setLightboxImage(null)} 
              style={{ position: 'absolute', top: '-2.5rem', right: '0', background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }}
            >
              &times;
            </button>
            <img 
              src={lightboxImage} 
              alt="Enlarged preview" 
              style={{ width: '100%', height: 'auto', maxHeight: '80vh', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)' }} 
              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800'; }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
