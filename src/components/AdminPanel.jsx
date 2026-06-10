import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Plus, Trash2, Edit, Check, X, Undo2, Lock, LogOut, ArrowUp, Upload } from 'lucide-react';

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

// Format Date Time as YYYY-MM-DD HH:mm
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

// Group borrow requests by applicant email, phone, and creation time (or emp_id + created_at)
const groupRequests = (reqs) => {
  const groups = {};
  reqs.forEach(req => {
    // We group by applicant_emp_id and created_at timestamp
    const key = `${req.applicant_emp_id}_${req.created_at}`;
    if (!groups[key]) {
      groups[key] = {
        id: req.id, // Using first ID as reference
        applicant_name: req.applicant_name,
        applicant_phone: req.applicant_phone,
        applicant_emp_id: req.applicant_emp_id,
        applicant_dept: req.applicant_dept,
        applicant_email: req.applicant_email,
        created_at: req.created_at,
        required_date: req.required_date,
        status: req.status,
        reject_reason: req.reject_reason,
        returned_at: req.returned_at,
        approved_at: req.approved_at,
        items: []
      };
    }
    // Track min ID for consistent case number generation
    if (req.id < groups[key].id) {
      groups[key].id = req.id;
    }
    groups[key].items.push(req);
  });

  // Calculate dynamic status for the group based on items
  Object.values(groups).forEach(group => {
    const statuses = group.items.map(item => item.status);
    const hasPending = statuses.includes('pending');
    const hasApproved = statuses.includes('approved');
    const hasReturned = statuses.includes('returned');
    const hasRejected = statuses.includes('rejected');
    
    if (hasPending) {
      group.status = 'pending';
    } else if (hasApproved && hasReturned) {
      group.status = 'partially_returned';
    } else if (hasApproved) {
      group.status = 'approved';
    } else if (hasReturned) {
      group.status = 'returned';
    } else if (hasRejected) {
      group.status = 'rejected';
    } else {
      group.status = 'approved';
    }
  });

  return Object.values(groups);
};

export default function AdminPanel() {
  const [session, setSession] = useState(null);
  const [isRegister, setIsRegister] = useState(false);
  
  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmpId, setRegEmpId] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regInvite, setRegInvite] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Main admin panel states
  const [activeSubTab, setActiveSubTab] = useState('requests'); // requests | inventory
  const [requests, setRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  // File upload state
  const [uploading, setUploading] = useState(false);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);

  // Re-authentication modal state (for Take Down / Delete)
  const [reAuthModalOpen, setReAuthModalOpen] = useState(false);
  const [reAuthItem, setReAuthItem] = useState(null);
  const [reAuthEmail, setReAuthEmail] = useState('');
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [reAuthLoading, setReAuthLoading] = useState(false);
  const [reAuthError, setReAuthError] = useState('');

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

  // Return modal state & checklist state
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returningGroup, setReturningGroup] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  const handleOpenReturnModal = (group) => {
    setReturningGroup(group);
    const initialChecked = {};
    group.items.forEach(item => {
      initialChecked[item.id] = item.status === 'returned';
    });
    setCheckedItems(initialChecked);
    setReturnModalOpen(true);
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    const itemsToUpdate = returningGroup.items.filter(item => item.status !== 'returned' && checkedItems[item.id]);
    
    if (itemsToUpdate.length === 0) {
      alert('請勾選要辦理歸還的器材。');
      return;
    }
    
    try {
      setLoading(true);
      const itemIds = itemsToUpdate.map(item => item.id);
      const { error } = await supabase
        .from('borrow_requests')
        .update({
          status: 'returned',
          returned_at: new Date().toISOString()
        })
        .in('id', itemIds);
        
      if (error) throw error;
      setReturnModalOpen(false);
      setReturningGroup(null);
      setCheckedItems({});
      await fetchAdminData();
    } catch (err) {
      console.error('Error handling return:', err);
      alert('辦理歸還失敗。');
    } finally {
      setLoading(false);
    }
  };

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

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    // Pre-shared Admin Invitation Code validation
    if (regInvite.trim() !== 'ERMS2026') {
      setRegError('註冊邀請碼有誤，請洽教學部系統管理員取得。');
      return;
    }

    setRegLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: {
          data: {
            display_name: regName,
            emp_id: regEmpId,
          }
        }
      });
      if (error) throw error;
      setRegSuccess('申請成功！若 Supabase 設定了信箱驗證，請至信箱點擊確認連結；若已關閉信箱驗證，您可立即在此登入。');
      // Clear fields
      setRegName('');
      setRegEmpId('');
      setRegEmail('');
      setRegPassword('');
      setRegInvite('');
    } catch (err) {
      console.error('Register error:', err);
      setRegError(`申請失敗：${err.message || '請確認信箱格式正確且密碼大於 6 位數。'}`);
    } finally {
      setRegLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Approval Actions (Group-based)
  const handleApproveRequest = async (group) => {
    try {
      const { error } = await supabase
        .from('borrow_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .in('id', group.items.map(item => item.id));
        
      if (error) throw error;
      await fetchAdminData();
    } catch (err) {
      console.error('Error approving request:', err);
      alert('核准失敗，請稍後再試。');
    }
  };

  const handleOpenRejectModal = (group) => {
    setRejectingRequest(group); // We store the group in rejectingRequest state
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
        .in('id', rejectingRequest.items.map(item => item.id));

      if (error) throw error;
      setRejectModalOpen(false);
      setRejectingRequest(null);
      await fetchAdminData();
    } catch (err) {
      console.error('Error rejecting request:', err);
      alert('拒絕審核失敗，請稍後再試。');
    }
  };

  // Group-based return handler is replaced by handleOpenReturnModal & handleReturnSubmit
  // Open Re-authentication modal for Taking Down/Deleting
  const handleOpenReAuthModal = (item) => {
    setReAuthItem(item);
    setReAuthEmail(session?.user?.email || '');
    setReAuthPassword('');
    setReAuthError('');
    setReAuthModalOpen(true);
  };

  // Execute Take Down/Delete after successful Re-authentication
  const handleReAuthSubmit = async (e) => {
    e.preventDefault();
    if (!reAuthPassword.trim()) return;

    try {
      setReAuthLoading(true);
      setReAuthError('');

      // Verify password by logging in again
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: reAuthEmail,
        password: reAuthPassword
      });

      if (authError) throw authError;

      // Update the item status to false (Take Down)
      const { error: updateError } = await supabase
        .from('teaching_aids')
        .update({ is_active: false })
        .eq('id', reAuthItem.id);

      if (updateError) throw updateError;

      setReAuthModalOpen(false);
      setReAuthItem(null);
      setReAuthPassword('');
      await fetchAdminData();
      alert(`已成功下架/刪除器材「${reAuthItem.name}」！`);
    } catch (err) {
      console.error('Re-auth error:', err);
      setReAuthError('二次認證失敗，密碼錯誤或帳號不符合管理員身份。');
    } finally {
      setReAuthLoading(false);
    }
  };

  // Restore/Put back up an item (doesn't require password, as it's a non-destructive action)
  const handlePutUpItem = async (itemId) => {
    try {
      const { error } = await supabase
        .from('teaching_aids')
        .update({ is_active: true })
        .eq('id', itemId);
        
      if (error) throw error;
      await fetchAdminData();
    } catch (err) {
      console.error('Error putting up item:', err);
      alert('上架器材失敗。');
    }
  };

  // Image Upload Handler
  const handleImageUpload = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload file to bucket 'teaching-aids-images'
      const { error: uploadError } = await supabase.storage
        .from('teaching-aids-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('teaching-aids-images')
        .getPublicUrl(filePath);

      setItemForm(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (err) {
      console.error('Error uploading image:', err);
      alert('圖片上傳失敗，請確認您的 Supabase Storage 建立了名為 "teaching-aids-images" 且訪問權限為 Public 的 Bucket。');
    } finally {
      setUploading(false);
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
            image_url: itemForm.image_url || 'images/vite.svg',
            is_active: true
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
        <div className="auth-card" style={{ maxWidth: '450px' }}>
          <div className="admin-tabs" style={{ marginBottom: '2rem' }}>
            <button
              type="button"
              className={`admin-tab ${!isRegister ? 'active' : ''}`}
              onClick={() => { setIsRegister(false); setLoginError(''); }}
              style={{ flex: 1, textAlign: 'center' }}
            >
              管理員登入
            </button>
            <button
              type="button"
              className={`admin-tab ${isRegister ? 'active' : ''}`}
              onClick={() => { setIsRegister(true); setRegError(''); setRegSuccess(''); }}
              style={{ flex: 1, textAlign: 'center' }}
            >
              申請管理帳號
            </button>
          </div>

          {!isRegister ? (
            /* LOGIN FORM */
            <form onSubmit={handleLogin}>
              <div className="auth-header" style={{ marginBottom: '1.5rem' }}>
                <Lock size={32} style={{ color: 'var(--primary)', display: 'block', margin: '0 auto 0.5rem' }} />
                <h3>管理後台登入</h3>
              </div>
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
              <button type="submit" className="btn-primary" disabled={loginLoading} style={{ marginTop: '1rem' }}>
                {loginLoading ? '登入中...' : '安全登入'}
              </button>
            </form>
          ) : (
            /* REGISTER FORM */
            <form onSubmit={handleRegister}>
              <div className="auth-header" style={{ marginBottom: '1.5rem' }}>
                <ShieldCheck size={32} style={{ color: 'var(--accent)', display: 'block', margin: '0 auto 0.5rem' }} />
                <h3>管理帳號申請</h3>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>管理員姓名 *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="請輸入姓名"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>員工編號 *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="請輸入員工編號"
                  value={regEmpId}
                  onChange={(e) => setRegEmpId(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>管理員信箱 *</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="email@hospital.org.tw"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>設定密碼 * (至少 6 位元)</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="設定登入密碼"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>註冊邀請碼 * (預設: ERMS2026)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="請輸入註冊驗證密鑰"
                  value={regInvite}
                  onChange={(e) => setRegInvite(e.target.value)}
                  required
                />
                <span className="helper-text">為防止他人任意註冊，請輸入邀請碼 <strong>ERMS2026</strong></span>
              </div>
              {regError && <p className="error-text" style={{ marginBottom: '1rem' }}>{regError}</p>}
              {regSuccess && <p className="success-text" style={{ color: 'var(--success)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: '1.4' }}>{regSuccess}</p>}
              <button type="submit" className="btn-primary" disabled={regLoading} style={{ marginTop: '1rem', background: 'var(--accent)' }}>
                {regLoading ? '申請中...' : '提交帳號申請'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <strong>💡 說明：</strong>
            <p style={{ marginTop: '0.25rem' }}>
              登入與註冊均使用 Supabase Auth 系統。若註冊後登入顯示「Email not confirmed」，請至 Supabase Dashboard 關閉信箱驗證（Confirm email）或檢查信箱點擊驗證連結。
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
          租借審核管理 ({groupRequests(requests).filter(r => r.status === 'pending').length} 案待審)
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
                <th style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                  案件起單時間
                  <br />
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 'normal' }}>
                    案件編號
                  </span>
                </th>
                <th style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                  申請人
                  <br />
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 'normal' }}>
                    員工編號
                  </span>
                </th>
                <th>申請單位</th>
                <th>手機及信箱</th>
                <th>預借器材清單</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '110px', verticalAlign: 'middle' }}>預約借用日期</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '95px', verticalAlign: 'middle' }}>申請狀態</th>
                <th style={{ whiteSpace: 'nowrap', minWidth: '110px', verticalAlign: 'middle' }}>審核操作</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暫無租借申請紀錄</td>
                </tr>
              ) : (
                groupRequests(requests).map(req => {
                  return (
                    <tr key={req.id}>
                      <td>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {formatDateTime(req.created_at)}
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                          {formatCaseNumber(req.id, req.created_at)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.applicant_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>工號: {req.applicant_emp_id}</div>
                      </td>
                      <td>{req.applicant_dept}</td>
                      <td>
                        <div>{req.applicant_phone}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{req.applicant_email}</div>
                      </td>
                      <td>
                        {req.items.map((item, idx) => {
                          const aid = resources.find(r => r.id === item.resource_id);
                          return (
                            <div key={item.id} style={{ 
                              padding: '0.4rem 0', 
                              borderBottom: idx < req.items.length - 1 ? '1px dashed var(--border-color)' : 'none' 
                            }}>
                              <div style={{ fontWeight: 600 }}>
                                {aid ? aid.name : '未知器材'} &nbsp; X &nbsp; 數量：{item.quantity} {aid ? aid.unit : '具'}
                                {item.status === 'returned' && (
                                  <span className="kanban-card-badge kanban-badge-returned" style={{ marginLeft: '0.5rem', fontSize: '0.7rem', verticalAlign: 'middle', padding: '1px 4px' }}>
                                    已還
                                  </span>
                                )}
                              </div>
                              {aid && (aid.brand || aid.model) && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {aid.brand && `廠牌: ${aid.brand}`} {aid.model && ` | 型號: ${aid.model}`}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <strong>{req.required_date}</strong>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <span className={`kanban-card-badge ${
                          req.status === 'pending' ? 'kanban-badge-pending' :
                          req.status === 'approved' ? 'kanban-badge-approved' :
                          req.status === 'partially_returned' ? 'kanban-badge-partial' :
                          req.status === 'returned' ? 'kanban-badge-returned' : 'kanban-badge-rejected'
                        }`}>
                          {req.status === 'pending' ? '待審核' :
                           req.status === 'approved' ? '租借中' :
                           req.status === 'partially_returned' ? '部分歸還' :
                           req.status === 'returned' ? '已歸還' : '已拒絕'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <div className="action-buttons">
                          {req.status === 'pending' && (
                            <>
                              <button
                                className="btn-small approve"
                                onClick={() => handleApproveRequest(req)}
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
                          {(req.status === 'approved' || req.status === 'partially_returned') && (
                            <button
                              className="btn-small return"
                              onClick={() => handleOpenReturnModal(req)}
                            >
                              <Undo2 size={14} /> 確認歸還
                            </button>
                          )}
                          {req.status === 'returned' && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              已全數歸還
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
                  );
                })
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
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {resources.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暫無器材資料庫，請新增上架。</td>
                  </tr>
                ) : (
                  resources.map(item => {
                    const isActive = item.is_active !== false;
                    return (
                      <tr key={item.id} style={{ opacity: isActive ? 1 : 0.65 }}>
                        <td style={{ color: 'var(--text-muted)' }}>{item.id}</td>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <img
                              src={item.image_url}
                              alt=""
                              style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', background: '#f1f5f9', cursor: 'zoom-in' }}
                              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=100'; }}
                              onClick={() => setLightboxImage(item.image_url)}
                              title="點選放大圖片"
                            />
                            {item.name}
                          </div>
                        </td>
                        <td>{item.brand || 'N/A'}</td>
                        <td>{item.model || 'N/A'}</td>
                        <td>{item.quantity} {item.unit || '具'}</td>
                        <td>
                          <span className={`kanban-card-badge ${isActive ? 'kanban-badge-approved' : 'kanban-badge-rejected'}`}>
                            {isActive ? '上架中' : '已下架'}
                          </span>
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
                            
                            {isActive ? (
                              <button
                                className="btn-icon delete"
                                title="下架此器材（需要管理員帳密認證）"
                                onClick={() => handleOpenReAuthModal(item)}
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : (
                              <button
                                className="btn-small"
                                title="重新上架此器材"
                                onClick={() => handlePutUpItem(item.id)}
                                style={{ background: 'var(--primary)', color: '#fff', padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                <ArrowUp size={12} /> 重新上架
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
                    <label>圖片上傳 (上傳至 Supabase Storage) *</label>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <label 
                        className="btn-add" 
                        style={{ 
                          margin: 0, 
                          background: 'var(--bg-tertiary)', 
                          color: 'var(--text-primary)', 
                          border: '1px solid var(--border-color)',
                          cursor: uploading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.75rem 1rem'
                        }}
                      >
                        <Upload size={16} />
                        {uploading ? '上傳中...' : '選擇本機圖片'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploading}
                          style={{ display: 'none' }}
                        />
                      </label>
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="或輸入圖片路徑/網址..."
                          value={itemForm.image_url}
                          onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                        />
                      </div>
                    </div>
                    {itemForm.image_url && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>✓ 已設定圖片連結</span>
                        <img 
                          src={itemForm.image_url} 
                          alt="" 
                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} 
                          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=100'; }}
                        />
                      </div>
                    )}
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

                <button type="submit" className="btn-primary" disabled={uploading}>
                  {selectedItem ? '確認修改' : '確認上架'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Re-Authentication Modal (For delete/take down) */}
      {reAuthModalOpen && (
        <div className="modal-overlay" onClick={() => setReAuthModalOpen(false)}>
          <div className="modal-container" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={20} />
                下架器材二次身分確認
              </h3>
              <button className="modal-close" onClick={() => setReAuthModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleReAuthSubmit}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  即將下架器材：<br />
                  <strong style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>{reAuthItem?.name}</strong>
                  <br />
                  此動作將使該器材自租借申請首頁隱藏。**請輸入您的管理員帳號密碼進行安全確認**。
                </p>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>管理員信箱</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="email@hospital.org.tw"
                    value={reAuthEmail}
                    onChange={(e) => setReAuthEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>管理員密碼</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="請輸入管理員密碼"
                    value={reAuthPassword}
                    onChange={(e) => setReAuthPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {reAuthError && <p className="error-text" style={{ marginBottom: '1rem' }}>{reAuthError}</p>}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={reAuthLoading}
                  style={{ background: 'var(--danger)', marginTop: '1.5rem' }}
                >
                  {reAuthLoading ? '認證中...' : '確認認證並下架器材'}
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
                  即將退回 <strong>{rejectingRequest?.applicant_name}</strong> 的租借申請（案件編號：{rejectingRequest && formatCaseNumber(rejectingRequest.id, rejectingRequest.created_at)}）：
                </p>
                <div style={{ margin: '0.5rem 0 1rem', maxHeight: '150px', overflowY: 'auto', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>退回器材明細：</div>
                  {rejectingRequest?.items?.map(item => {
                    const aid = resources.find(r => r.id === item.resource_id);
                    return (
                      <div key={item.id} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span>• {aid ? aid.name : '未知器材'}</span>
                        <span>{item.quantity} {aid ? aid.unit : '具'}</span>
                      </div>
                    );
                  })}
                </div>
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

      {/* Return checklist modal */}
      {returnModalOpen && returningGroup && (
        <div className="modal-overlay" onClick={() => setReturnModalOpen(false)}>
          <div className="modal-container" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>辦理器材歸還</h3>
              <button className="modal-close" onClick={() => setReturnModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleReturnSubmit}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                  案件編號：<strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{formatCaseNumber(returningGroup.id, returningGroup.created_at)}</strong><br />
                  借用人：<strong>{returningGroup.applicant_name}</strong><br />
                  說明：請勾選本次歸還的器材。全部勾選後狀態為<strong>已歸還</strong>；未全部勾選則設為<strong>部分歸還</strong>。
                </p>
                
                <div style={{ 
                  margin: '1rem 0 1.5rem', 
                  maxHeight: '200px', 
                  overflowY: 'auto', 
                  background: 'var(--bg-secondary)', 
                  padding: '1rem', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                    預借器材清單 (勾選欲歸還之品項)
                  </div>
                  {returningGroup.items.map(item => {
                    const aid = resources.find(r => r.id === item.resource_id);
                    const isAlreadyReturned = item.status === 'returned';
                    return (
                      <label key={item.id} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.6rem', 
                        cursor: isAlreadyReturned ? 'not-allowed' : 'pointer', 
                        opacity: isAlreadyReturned ? 0.65 : 1,
                        fontSize: '0.9rem',
                        userSelect: 'none'
                      }}>
                        <input
                          type="checkbox"
                          checked={!!checkedItems[item.id]}
                          disabled={isAlreadyReturned}
                          onChange={(e) => {
                            setCheckedItems(prev => ({
                              ...prev,
                              [item.id]: e.target.checked
                            }));
                          }}
                          style={{ width: '16px', height: '16px', cursor: isAlreadyReturned ? 'not-allowed' : 'pointer' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600 }}>{aid ? aid.name : '未知器材'}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            X 數量：{item.quantity} {aid ? aid.unit : '具'}
                          </span>
                          {isAlreadyReturned && (
                            <span className="kanban-card-badge kanban-badge-returned" style={{ fontSize: '0.75rem', padding: '1px 4px' }}>
                              已歸還
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--success)' }}>
                    確認歸還變更
                  </button>
                </div>
              </form>
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
