import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Filter, AlertCircle, CheckCircle2, ShoppingBag } from 'lucide-react';

export default function RequestPage() {
  const [resources, setResources] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  
  // Modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    phone: '',
    empId: '',
    dept: '',
    email: '',
    requiredDate: ''
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
    // The date needs to be greater than 3 working days, so the day AFTER the 3rd working day.
    date.setDate(date.getDate() + 1);
    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenBorrowModal = (item) => {
    setSelectedItem(item);
    setForm({
      name: '',
      phone: '',
      empId: '',
      dept: '',
      email: '',
      requiredDate: ''
    });
    setErrors({});
    setSubmitSuccess(false);
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
      // Reset hours to compare dates only
      selected.setHours(0,0,0,0);
      minDate.setHours(0,0,0,0);
      if (selected < minDate) {
        newErrors.requiredDate = `需求日期必須大於三個工作天 (最早可選: ${getMinSelectableDate()})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const { error } = await supabase
        .from('borrow_requests')
        .insert({
          resource_id: selectedItem.id,
          applicant_name: form.name,
          applicant_phone: form.phone,
          applicant_emp_id: form.empId,
          applicant_dept: form.dept,
          applicant_email: form.email,
          required_date: form.requiredDate,
          quantity: 1,
          status: 'pending'
        });

      if (error) throw error;
      setSubmitSuccess(true);
      // Refresh requests to update UI quantities immediately
      await fetchData();
    } catch (err) {
      console.error('Error submitting request:', err);
      alert('提交申請失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter and search logic
  const filteredResources = resources.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.remarks && item.remarks.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesBrand = selectedBrand === '' || item.brand === selectedBrand;
    
    return matchesSearch && matchesBrand;
  });

  // Extract unique brands for filter dropdown
  const brands = [...new Set(resources.map(r => r.brand).filter(Boolean))];

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
          <ShoppingBag size={16} />
          <span>共有 {filteredResources.length} 款器材可供選擇</span>
        </div>
      </div>
      <p className="subtitle">選擇您需要借用的臨床技能教具，填寫申請表單。請注意：借用申請須提前至少三個工作天提交。</p>

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
        <div className="cards-grid">
          {filteredResources.map(item => {
            const available = getAvailableQty(item);
            let badgeClass = 'badge-available';
            let badgeText = '庫存充足';
            
            if (available === 0) {
              badgeClass = 'badge-out';
              badgeText = '無庫存';
            } else if (available === 1) {
              badgeClass = 'badge-low';
              badgeText = '庫存緊張';
            }

            return (
              <div key={item.id} className="item-card">
                <div className="card-image-wrapper">
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
                    {item.remarks && (
                      <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block' }}>
                        <strong>備註:</strong> {item.remarks}
                      </div>
                    )}
                  </div>
                  <button
                    className="card-btn"
                    disabled={available === 0}
                    onClick={() => handleOpenBorrowModal(item)}
                  >
                    {available === 0 ? '目前無庫存' : '申請租借'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Borrow Request Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.25rem' }}>教具租借申請表</h3>
              <button className="modal-close" onClick={() => setSelectedItem(null)}>
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              {submitSuccess ? (
                <div className="empty-state" style={{ padding: '2rem 0' }}>
                  <CheckCircle2 size={64} style={{ color: 'var(--success)' }} />
                  <h2>申請成功！</h2>
                  <p style={{ margin: '1rem 0' }}>您對 <strong>{selectedItem.name}</strong> 的租借申請已成功送出。</p>
                  <p className="helper-text">請耐心等待教學部管理員審核。您可前往「租借狀態看板」查看目前申請狀態。</p>
                  <button className="btn-primary" style={{ width: 'auto', padding: '0.75rem 2rem' }} onClick={() => setSelectedItem(null)}>
                    關閉視窗
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem', borderLeft: '3px solid var(--primary)' }}>
                    <h4 style={{ color: '#fff', marginBottom: '0.25rem' }}>您選擇的器材：</h4>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary)' }}>{selectedItem.name}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      廠牌: {selectedItem.brand || 'N/A'} | 規格/型號: {selectedItem.model || 'N/A'}
                    </p>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>姓名 *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="請輸入姓名"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                      />
                      {errors.phone && <span className="error-text">{errors.phone}</span>}
                    </div>

                    <div className="form-group">
                      <label>員工編號 *</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="請輸入員工編號"
                        value={form.empId}
                        onChange={(e) => setForm({ ...form, empId: e.target.value })}
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
                      />
                      {errors.dept && <span className="error-text">{errors.dept}</span>}
                    </div>

                    <div className="form-group full-width">
                      <label>電子信箱 *</label>
                      <input
                        type="email"
                        className="input-field"
                        placeholder="例如: applicant@hospital.org.tw"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                      {errors.email && <span className="error-text">{errors.email}</span>}
                    </div>

                    <div className="form-group full-width">
                      <label>需求日期 * (需大於三個工作天)</label>
                      <input
                        type="date"
                        className="input-field"
                        min={getMinSelectableDate()}
                        value={form.requiredDate}
                        onChange={(e) => setForm({ ...form, requiredDate: e.target.value })}
                      />
                      <span className="helper-text">
                        配合行政流程，預約日期須至少排除今天起算 3 個工作天（六日不計）。目前最早可預約日期：{getMinSelectableDate()}
                      </span>
                      {errors.requiredDate && <span className="error-text">{errors.requiredDate}</span>}
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? '提交中...' : '送出租借申請'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
