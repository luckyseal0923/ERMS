import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Plus, Trash2, Edit, Check, X, Undo2, Lock, LogOut } from 'lucide-react';

export default function AdminPanel() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Main admin panel states
  const [activeSubTab, setActiveSubTab] = useState('requests'); // requests | inventory
  const [requests, setRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit / Add modal states
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); // null means adding
  const [itemForm, setItemForm] = useState({
    name: '',
    brand: '',
    model: '',
    quantity: 1,
    unit: '具',
    remarks: '',
    image_url: ''
  });

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchAdminData();
    }
  }, [session]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      
      // Fetch teaching aids
      const { data: aids, error: aidsError } = await supabase
        .from('teaching_aids')
        .select('*')
        .order('id', { ascending: true });
      if (aidsError) throw aidsError;

      // Fetch requests
      const { data: reqs, error: reqsError } = await supabase
        .from('borrow_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (reqsError) throw reqsError;

      setResources(aids || []);
      setRequests(reqs || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('登入失敗，請確認信箱及密碼是否正確，或已在 Supabase 註冊此管理員。');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Approval Actions
  const handleApproveRequest = async (reqId) => {
    try {
      const { error } = await supabase
        .from('borrow_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', reqId);
        
      if (error) throw error;
      await fetchAdminData();
    } catch (err) {
      console.error('Error approving request:', err);
      alert('核准失敗，請稍後再試。');
    }
  };

  const handleOpenRejectModal = (req) => {
    setRejectingRequest(req);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectRequestSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    try {
      const { error } = await supabase
        .from('borrow_requests')
        .update({
          status: 'rejected',
          reject_reason: rejectReason
        })
        .eq('id', rejectingRequest.id);

      if (error) throw error;
      setRejectModalOpen(false);
      setRejectingRequest(null);
      await fetchAdminData();
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('拒絕審核失敗，請稍後再試。');
    }
  };

  const handleReturnRequest = async (reqId) => {
    try {
      const { error } = await supabase
        .from('borrow_requests')
        .update({
          status: 'returned',
          returned_at: new Date().toISOString()
        })
        .eq('id', reqId);

      if (error) throw error;
      await fetchAdminData();
    } catch (err) {
      console.error('Error returning request:', err);
      alert('辦理歸還失敗。');
    }
  };

  // CRUD Item actions
  const handleOpenItemModal = (item = null) => {
    setSelectedItem(item);
    if (item) {
      setItemForm({
        name: item.name,
        brand: item.brand || '',
        model: item.model || '',
        quantity: item.quantity,
        unit: item.unit || '具',
        remarks: item.remarks || '',
        image_url: item.image_url || ''
      });
    } else {
      setItemForm({
        name: '',
        brand: '',
        model: '',
        quantity: 1,
        unit: '具',
        remarks: '',
        image_url: ''
      });
    }
    setItemModalOpen(true);
  };

  const handleItemFormSubmit = async (e) => {
    e.preventDefault();
    if (!itemForm.name.trim()) return;

    try {
      if (selectedItem) {
        // Edit Mode
        const { error } = await supabase
          .from('teaching_aids')
          .update({
            name: itemForm.name,
            brand: itemForm.brand,
            model: itemForm.model,
            quantity: parseInt(itemForm.quantity),
            unit: itemForm.unit,
            remarks: itemForm.remarks,
            image_url: itemForm.image_url
          })
          .eq('id', selectedItem.id);
        if (error) throw error;
      } else {
        // Add Mode
        const { error } = await supabase
          .from('teaching_aids')
          .insert({
            name: itemForm.name,
            brand: itemForm.brand,
            model: itemForm.model,
            quantity: parseInt(itemForm.quantity),
            unit: itemForm.unit,
            remarks: itemForm.remarks,
            image_url: itemForm.image_url || 'images/vite.svg'
          });
        if (error) throw error;
      }
      setItemModalOpen(false);
      await fetchAdminData();
    } catch (err) {
      console.error('Error saving item:', err);
      alert('儲存器材失敗，請檢查資料庫連線或 RLS 安全設定。');
    }
  };

  const handleDeleteItem = async (itemId, itemName) => {
    if (!window.confirm(`確定要下架/刪除器材「${itemName}」嗎？此操作無法還原。`)) return;

    try {
      const { error } = await supabase
        .from('teaching_aids')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      await fetchAdminData();
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('刪除器材失敗。');
    }
  };

  const getResourceName = (resId) => {
    const aid = resources.find(r => r.id === resId);
    return aid ? aid.name : '未知器材';
  };

  // Loading indicator for fetching data after successful login
  const showDataSpinner = loading && session;

  // Render Login page if no session
  if (!session) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <Lock size={40} />
            <h2>管理後台登入</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              僅限教學部管理人員登入
            </p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>管理員信箱</label>
              <input
                type="email"
                className="input-field"
                placeholder="email@hospital.org.tw"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>密碼</label>
              <input
                type="password"
                className="input-field"
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {loginError && <p className="error-text" style={{ marginBottom: '1rem' }}>{loginError}</p>}
            <button type="submit" className="btn-primary" disabled={loginLoading}>
              {loginLoading ? '登入中...' : '安全登入'}
            </button>
          </form>

          <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <strong>💡 如何新增管理員？</strong>
            <p style={{ marginTop: '0.25rem', lineHeight: '1.4' }}>
              請前往您 Supabase 專案的 <strong>Authentication &gt; Users</strong> 點選 <strong>Add User &gt; Create User</strong> 建立您的 Email 與 Password，即可在此登入。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {/* Admin Title & Header Info */}
      <div className="admin-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShieldCheck style={{ color: 'var(--success)' }} />
            後台管理系統
          </h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            目前登入者：{session.user.email} (管理者權限)
          </p>
        </div>
        <button className="nav-link" onClick={handleLogout} style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.08)' }}>
          <LogOut size={16} />
          登出系統
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeSubTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('requests')}
        >
          租借審核管理 ({requests.filter(r => r.status === 'pending').length} 件待審)
        </button>
        <button
          className={`admin-tab ${activeSubTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('inventory')}
        >
          器材庫存管理 ({resources.length} 種)
        </button>
      </div>

      {showDataSpinner ? (
        <div className="spinner-wrapper">
          <div className="spinner"></div>
        </div>
      ) : activeSubTab === 'requests' ? (
        /* SUBTAB: REQUESTS APPROVAL */
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>器材名稱</th>
                <th>申請人 / 員工編號</th>
                <th>申請單位</th>
                <th>手機 / 信箱</th>
                <th>預約借用日期</th>
                <th>申請狀態</th>
                <th>審核操作</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暫無租借申請紀錄</td>
                </tr>
              ) : (
                requests.map(req => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600 }}>{getResourceName(req.resource_id)}</td>
                    <td>
                      <div>{req.applicant_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>編號: {req.applicant_emp_id}</div>
                    </td>
                    <td>{req.applicant_dept}</td>
                    <td>
                      <div>{req.applicant_phone}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.applicant_email}</div>
                    </td>
                    <td>{req.required_date}</td>
                    <td>
                      <span className={`kanban-card-badge ${
                        req.status === 'pending' ? 'kanban-badge-pending' :
                        req.status === 'approved' ? 'kanban-badge-approved' :
                        req.status === 'returned' ? 'kanban-badge-returned' : 'kanban-badge-rejected'
                      }`}>
                        {req.status === 'pending' ? '待審核' :
                         req.status === 'approved' ? '租借中' :
                         req.status === 'returned' ? '已歸還' : '已拒絕'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {req.status === 'pending' && (
                          <>
                            <button
                              className="btn-small approve"
                              onClick={() => handleApproveRequest(req.id)}
                            >
                              <Check size={14} /> 批准
                            </button>
                            <button
                              className="btn-small reject"
                              onClick={() => handleOpenRejectModal(req)}
                            >
                              <X size={14} /> 拒絕
                            </button>
                          </>
                        )}
                        {req.status === 'approved' && (
                          <button
                            className="btn-small return"
                            onClick={() => handleReturnRequest(req.id)}
                          >
                            <Undo2 size={14} /> 確認歸還
                          </button>
                        )}
                        {req.status === 'returned' && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            歸還於 {new Date(req.returned_at).toLocaleDateString('zh-TW')}
                          </span>
                        )}
                        {req.status === 'rejected' && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }} title={req.reject_reason}>
                            已拒絕 ({req.reject_reason || '未說明'})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* SUBTAB: INVENTORY CRUD */
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button className="btn-add" onClick={() => handleOpenItemModal(null)}>
              <Plus size={16} /> 上架新器材
            </button>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>器材名稱</th>
                  <th>廠牌</th>
                  <th>規格 / 型號</th>
                  <th>總數量</th>
                  <th>備註</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {resources.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暫無器材資料庫，請新增上架。</td>
                  </tr>
                ) : (
                  resources.map(item => (
                    <tr key={item.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{item.id}</td>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <img
                            src={item.image_url}
                            alt=""
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', background: '#020617' }}
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=100'; }}
                          />
                          {item.name}
                        </div>
                      </td>
                      <td>{item.brand || 'N/A'}</td>
                      <td>{item.model || 'N/A'}</td>
                      <td>{item.quantity} {item.unit || '具'}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.remarks}>
                        {item.remarks || '--'}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-icon"
                            title="編輯器材資訊"
                            onClick={() => handleOpenItemModal(item)}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            className="btn-icon delete"
                            title="下架此器材"
                            onClick={() => handleDeleteItem(item.id, item.name)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CRUD Add/Edit Modal */}
      {itemModalOpen && (
        <div className="modal-overlay" onClick={() => setItemModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedItem ? '編輯器材資料' : '上架新器材'}</h3>
              <button className="modal-close" onClick={() => setItemModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleItemFormSubmit}>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>器材名稱 *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="請輸入器材名稱/主題"
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>廠牌</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如: Laerdal"
                      value={itemForm.brand}
                      onChange={(e) => setItemForm({ ...itemForm, brand: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>規格 / 型號</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如: VT-900"
                      value={itemForm.model}
                      onChange={(e) => setItemForm({ ...itemForm, model: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>總庫存數量 *</label>
                    <input
                      type="number"
                      className="input-field"
                      min="1"
                      value={itemForm.quantity}
                      onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>單位</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如: 具、組、台"
                      value={itemForm.unit}
                      onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>圖片相對路徑 (相對於 public 目錄) / URL</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="例如: images/item_1.jpg 或 外部圖片 URL"
                      value={itemForm.image_url}
                      onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                    />
                    <span className="helper-text">留空時，系統會自動填入預設圖片。</span>
                  </div>

                  <div className="form-group full-width">
                    <label>備註欄位</label>
                    <textarea
                      className="input-field"
                      placeholder="例如: 傷口部位、可置換配件..."
                      value={itemForm.remarks}
                      onChange={(e) => setItemForm({ ...itemForm, remarks: e.target.value })}
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary">
                  {selectedItem ? '確認修改' : '確認上架'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectModalOpen && (
        <div className="modal-overlay" onClick={() => setRejectModalOpen(false)}>
          <div className="modal-container" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>退回租借申請</h3>
              <button className="modal-close" onClick={() => setRejectModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleRejectRequestSubmit}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  即將退回 <strong>{rejectingRequest?.applicant_name}</strong> 的租借申請：<br />
                  <span style={{ color: '#fff' }}>{getResourceName(rejectingRequest?.resource_id)}</span>
                </p>
                <div className="form-group">
                  <label>退回原因 / 說明 *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="請輸入退回原因 (例如: 該時段教具已排定保養)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ background: 'var(--danger)' }}>
                  確認拒絕申請
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
