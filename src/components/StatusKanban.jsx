import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Search, Clock, CheckCircle2, XCircle, Play, Calendar } from 'lucide-react';

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

  // Filter requests based on search
  const filteredRequests = requests.filter(req => {
    const resourceName = getResourceName(req.resource_id).toLowerCase();
    const applicantName = req.applicant_name.toLowerCase();
    const empId = req.applicant_emp_id.toLowerCase();
    const dept = req.applicant_dept.toLowerCase();
    const search = searchTerm.toLowerCase();

    return (
      resourceName.includes(search) ||
      applicantName.includes(search) ||
      empId.includes(search) ||
      dept.includes(search)
    );
  });

  // Categorize
  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved');
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
                  <div className="kanban-card-title">{getResourceName(req.resource_id)}</div>
                  <div className="kanban-card-detail">
                    <div>申請人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                    <div>員工編號：<span>{req.applicant_emp_id}</span></div>
                    <div>需求日期：<span>{req.required_date}</span></div>
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
                  <div className="kanban-card-title">{getResourceName(req.resource_id)}</div>
                  <div className="kanban-card-detail">
                    <div>借用人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                    <div>員工編號：<span>{req.applicant_emp_id}</span></div>
                    <div>借用日期：<span>{req.required_date}</span></div>
                  </div>
                  <div className="kanban-card-footer">
                    <span style={{ color: 'var(--text-muted)' }}>
                      已於 {req.approved_at ? new Date(req.approved_at).toLocaleDateString('zh-TW') : '日前'} 批准
                    </span>
                    <span className="kanban-card-badge kanban-badge-approved">使用中</span>
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
                  <div className="kanban-card-title">{getResourceName(req.resource_id)}</div>
                  <div className="kanban-card-detail">
                    <div>申請人：<span>{req.applicant_name} ({req.applicant_dept})</span></div>
                    <div>需求日期：<span>{req.required_date}</span></div>
                    {req.status === 'rejected' && req.reject_reason && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        拒絕原因：{req.reject_reason}
                      </div>
                    )}
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
