import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Clock, CheckCircle2, XCircle, Play, Calendar } from 'lucide-react';

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
        course_name: req.course_name,
        target_audience: req.target_audience,
        expected_return_date: req.expected_return_date,
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

export default function StatusKanban() {
  const [requests, setRequests] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
    // Subscribe to realtime updates for instant Kanban sync!
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'borrow_requests' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch requests
      const { data: reqs, error: reqsError } = await supabase
        .from('borrow_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (reqsError) throw reqsError;

      // Fetch teaching aids to map names
      const { data: aids, error: aidsError } = await supabase
        .from('teaching_aids')
        .select('id, name, brand, model');
      if (aidsError) throw aidsError;

      setRequests(reqs || []);
      setResources(aids || []);
    } catch (err) {
      console.error('Error fetching kanban data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getResourceName = (resId) => {
    const aid = resources.find(r => r.id === resId);
    return aid ? `${aid.name} (${aid.brand || 'N/A'} - ${aid.model || 'N/A'})` : '未知器材';
  };

  // Group all requests first
  const groupedRequests = groupRequests(requests);

  // Filter grouped requests based on search
  const filteredRequests = groupedRequests.filter(group => {
    const applicantName = group.applicant_name.toLowerCase();
    const empId = group.applicant_emp_id.toLowerCase();
    const dept = group.applicant_dept.toLowerCase();
    const caseNumber = formatCaseNumber(group.id, group.created_at).toLowerCase();
    const rawId = String(group.id).toLowerCase();
    const search = searchTerm.toLowerCase();

    // Check if any resource name in the group matches the search term
    const matchesResource = group.items.some(item => {
      const name = getResourceName(item.resource_id).toLowerCase();
      return name.includes(search);
    });

    return (
      matchesResource ||
      applicantName.includes(search) ||
      empId.includes(search) ||
      dept.includes(search) ||
      caseNumber.includes(search) ||
      rawId === search
    );
  });

  // Categorize grouped and filtered cases
  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved' || r.status === 'partially_returned');
  const returnedRequests = filteredRequests.filter(r => r.status === 'returned' || r.status === 'rejected');

  if (loading && requests.length === 0) {
    return (
      <div className="spinner-wrapper">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1>租借狀態看板</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <Clock size={16} />
          <span>即時動態同步中</span>
        </div>
      </div>
      <p className="subtitle">此看板展示所有器材租借的處理狀態。一般同仁可在此查詢自己申請案的審核與租借進度。</p>

      {/* Search Filter */}
      <div className="search-filter-bar" style={{ maxWidth: '500px' }}>
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="搜尋申請人姓名、員工編號、科別或器材..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board">
        {/* Column 1: Pending */}
        <div className="kanban-column">
          <div className="kanban-column-header">
            <span className="kanban-column-title" style={{ color: 'var(--warning)' }}>
              <Clock size={18} />
              審核中
            </span>
            <span className="kanban-column-count">{pendingRequests.length}</span>
          </div>
          <div className="kanban-column-content">
            {pendingRequests.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem', fontSize: '0.85rem' }}>
                暫無審核中申請
              </div>
            ) : (
              pendingRequests.map(req => (
                <div key={req.id} className="kanban-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="case-number-badge" style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      background: 'var(--primary-glow)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      border: '1px solid rgba(14, 165, 233, 0.2)'
                    }}>
                      {formatCaseNumber(req.id, req.created_at)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      品項數：{req.items.length}
                    </span>
                  </div>
                    <div className="kanban-card-detail">
                      <div>申請人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                      <div>課程/對象：<span>{req.course_name || '無'} / {req.target_audience || '無'}</span></div>
                      <div>需求日期：<span>{req.required_date}</span></div>
                      <div>預計歸還：<span>{req.expected_return_date || '未定'}</span></div>
                    
                    {/* Item list detail */}
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                      {req.items.map(item => {
                        const aid = resources.find(r => r.id === item.resource_id);
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={aid ? aid.name : '未知器材'}>
                              • {aid ? aid.name : '未知器材'}
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {item.quantity} {aid ? aid.unit : '具'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="kanban-card-footer">
                    <span style={{ color: 'var(--text-muted)' }}>
                      申請於: {new Date(req.created_at).toLocaleDateString('zh-TW')}
                    </span>
                    <span className="kanban-card-badge kanban-badge-pending">待審核</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Approved / Borrowed */}
        <div className="kanban-column">
          <div className="kanban-column-header">
            <span className="kanban-column-title" style={{ color: 'var(--primary)' }}>
              <Play size={18} />
              已借出 / 租借中
            </span>
            <span className="kanban-column-count">{approvedRequests.length}</span>
          </div>
          <div className="kanban-column-content">
            {approvedRequests.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem', fontSize: '0.85rem' }}>
                暫無借出中器材
              </div>
            ) : (
              approvedRequests.map(req => (
                <div key={req.id} className="kanban-card" style={{ borderLeft: '3px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="case-number-badge" style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      background: 'var(--primary-glow)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      border: '1px solid rgba(14, 165, 233, 0.2)'
                    }}>
                      {formatCaseNumber(req.id, req.created_at)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      品項數：{req.items.length}
                    </span>
                  </div>
                  <div className="kanban-card-detail">
                    <div>借用人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                    <div>課程/對象：<span>{req.course_name || '無'} / {req.target_audience || '無'}</span></div>
                    <div>借用日期：<span>{req.required_date}</span></div>
                    <div>預計歸還：<span>{req.expected_return_date || '未定'}</span></div>
                    
                    {/* Item list detail */}
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                      {req.items.map(item => {
                        const aid = resources.find(r => r.id === item.resource_id);
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={aid ? aid.name : '未知器材'}>
                              • {aid ? aid.name : '未知器材'}
                              {item.status === 'returned' && (
                                <span className="kanban-card-badge kanban-badge-returned" style={{ marginLeft: '0.4rem', fontSize: '0.65rem', padding: '0px 3px', verticalAlign: 'middle' }}>
                                  已還
                                </span>
                              )}
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {item.quantity} {aid ? aid.unit : '具'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="kanban-card-footer">
                    <span style={{ color: 'var(--text-muted)' }}>
                      已於 {req.approved_at ? new Date(req.approved_at).toLocaleDateString('zh-TW') : '日前'} 批准
                    </span>
                    <span className={`kanban-card-badge ${req.status === 'partially_returned' ? 'kanban-badge-partial' : 'kanban-badge-approved'}`}>
                      {req.status === 'partially_returned' ? '部分歸還' : '使用中'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Returned or Rejected */}
        <div className="kanban-column">
          <div className="kanban-column-header">
            <span className="kanban-column-title" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={18} />
              已歸還 / 歷史紀錄
            </span>
            <span className="kanban-column-count">{returnedRequests.length}</span>
          </div>
          <div className="kanban-column-content">
            {returnedRequests.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem', fontSize: '0.85rem' }}>
                暫無歷史紀錄
              </div>
            ) : (
              returnedRequests.map(req => (
                <div key={req.id} className="kanban-card" style={{ opacity: 0.75 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="case-number-badge" style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      background: 'var(--primary-glow)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      border: '1px solid rgba(14, 165, 233, 0.2)'
                    }}>
                      {formatCaseNumber(req.id, req.created_at)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      品項數：{req.items.length}
                    </span>
                  </div>
                  <div className="kanban-card-detail">
                    <div>申請人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                    <div>課程/對象：<span>{req.course_name || '無'} / {req.target_audience || '無'}</span></div>
                    <div>需求日期：<span>{req.required_date}</span></div>
                    <div>預計歸還：<span>{req.expected_return_date || '未定'}</span></div>
                    {req.status === 'rejected' && req.reject_reason && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        拒絕原因：{req.reject_reason}
                      </div>
                    )}
                    
                    {/* Item list detail */}
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)' }}>
                      {req.items.map(item => {
                        const aid = resources.find(r => r.id === item.resource_id);
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }} title={aid ? aid.name : '未知器材'}>
                              • {aid ? aid.name : '未知器材'}
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {item.quantity} {aid ? aid.unit : '具'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="kanban-card-footer">
                    <span style={{ color: 'var(--text-muted)' }}>
                      {req.status === 'returned' ? '歸還於: ' + new Date(req.returned_at).toLocaleDateString('zh-TW') : '審查未通過'}
                    </span>
                    <span className={`kanban-card-badge ${req.status === 'returned' ? 'kanban-badge-returned' : 'kanban-badge-rejected'}`}>
                      {req.status === 'returned' ? '已歸還' : '已拒絕'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
