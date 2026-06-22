import React, { useState, useEffect } from 'react';

export default function SellerWallet({ apiBase, getToken }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchWallet = async () => {
    try {
      const res = await fetch(`${apiBase}/api/shops/mine/wallet`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWallet(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to fetch wallet info');
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
      setError('Network error fetching wallet info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!bankName || !accountNumber) {
      setError('Please fill in bank name and account number.');
      return;
    }

    setWithdrawing(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${apiBase}/api/shops/mine/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          bankName,
          accountNumber
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Withdrawal request successfully processed!');
        setWallet(data.wallet);
        setAmount('');
        setBankName('');
        setAccountNumber('');
      } else {
        setError(data.error || 'Withdrawal request failed');
      }
    } catch (err) {
      setError(err.message || 'Server error processing withdrawal');
    } finally {
      setWithdrawing(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid var(--border-light)',
    background: '#f8fafc',
    marginBottom: '15px',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--text-muted)'
  };

  if (loading) {
    return <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading wallet information...</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '30px', alignItems: 'start' }}>
      
      {/* LEFT COLUMN: BALANCE CARDS & TRANSACTIONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Balances Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Main Balance */}
          <div className="ds-glass-card" style={{ 
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
            color: 'white', 
            borderRadius: '20px', 
            padding: '25px', 
            boxShadow: '0 10px 20px rgba(16, 185, 209, 0.15)' 
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Available Balance</h4>
            <div style={{ fontSize: '2.5rem', fontWeight: '950' }}>
              ${wallet ? wallet.balance.toFixed(2) : '0.00'}
            </div>
            <p style={{ margin: '15px 0 0 0', fontSize: '0.78rem', opacity: 0.8 }}>Ready for transfer to your linked bank account.</p>
          </div>

          {/* Escrow Balance */}
          <div className="ds-glass-card" style={{ 
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
            color: 'white', 
            borderRadius: '20px', 
            padding: '25px', 
            boxShadow: '0 10px 20px rgba(99, 102, 241, 0.15)' 
          }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>Pending Escrow</h4>
            <div style={{ fontSize: '2.5rem', fontWeight: '950' }}>
              ${wallet ? wallet.pendingEscrow.toFixed(2) : '0.00'}
            </div>
            <p style={{ margin: '15px 0 0 0', fontSize: '0.78rem', opacity: 0.8 }}>Secured in escrow. Released upon successful delivery confirmation.</p>
          </div>

        </div>

        {/* Transactions list */}
        <div className="ds-glass-card" style={{ padding: '30px', background: 'white', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-main)' }}>Transaction History</h3>
          
          {!wallet || !wallet.transactions || wallet.transactions.length === 0 ? (
            <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No transactions recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600' }}>
                    <th style={{ padding: '12px 10px' }}>Date</th>
                    <th style={{ padding: '12px 10px' }}>Type</th>
                    <th style={{ padding: '12px 10px' }}>Description</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.transactions.slice().reverse().map((tx, idx) => {
                    const isCredit = tx.amount > 0;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                        <td style={{ padding: '14px 10px', whiteSpace: 'nowrap' }}>
                          {new Date(tx.createdAt).toLocaleDateString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '14px 10px' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: '700', 
                            padding: '3px 8px', 
                            borderRadius: '99px',
                            background: tx.type === 'withdrawal' ? '#fee2e2' : tx.type === 'escrow_payout' ? '#dcfce7' : '#f1f5f9',
                            color: tx.type === 'withdrawal' ? '#ef4444' : tx.type === 'escrow_payout' ? '#16a34a' : '#475569',
                            textTransform: 'uppercase'
                          }}>
                            {tx.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {tx.description}
                        </td>
                        <td style={{ padding: '14px 10px', textAlign: 'right', fontWeight: '700', color: isCredit ? '#10b981' : '#ef4444' }}>
                          {isCredit ? '+' : ''}${tx.amount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* RIGHT COLUMN: WITHDRAWAL REQUEST FORM */}
      <div className="ds-glass-card" style={{ background: 'white', borderRadius: '20px', border: '1px solid var(--border-light)', padding: '25px', position: 'sticky', top: '120px' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-main)' }}>Withdraw Payout</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Transfer funds safely from your shop wallet directly to your linked bank account.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '10px 12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleWithdraw}>
          <label style={labelStyle} htmlFor="withdraw-amount">Amount ($)</label>
          <input 
            id="withdraw-amount"
            type="number" 
            placeholder="e.g. 50" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            style={inputStyle}
            min="1"
            step="any"
            required
          />

          <label style={labelStyle} htmlFor="withdraw-bank">Bank Partner</label>
          <select 
            id="withdraw-bank"
            value={bankName} 
            onChange={e => setBankName(e.target.value)} 
            style={inputStyle}
            required
          >
            <option value="">Select Bank...</option>
            <option value="Vietcombank">Vietcombank (VCB)</option>
            <option value="Techcombank">Techcombank (TCB)</option>
            <option value="MB Bank">MB Bank (Military Bank)</option>
            <option value="Vietinbank">Vietinbank</option>
            <option value="BIDV">BIDV</option>
            <option value="Mock International Transfer">Mock International Transfer</option>
          </select>

          <label style={labelStyle} htmlFor="withdraw-account">Account Number</label>
          <input 
            id="withdraw-account"
            type="text" 
            placeholder="Account or Card Number" 
            value={accountNumber} 
            onChange={e => setAccountNumber(e.target.value)} 
            style={inputStyle}
            required
          />

          <button 
            type="submit" 
            className="ds-button" 
            disabled={withdrawing} 
            style={{ width: '100%', marginTop: '10px', background: withdrawing ? 'var(--text-muted)' : 'var(--primary-color)' }}
          >
            {withdrawing ? 'Processing Request...' : 'Submit Withdrawal'}
          </button>
        </form>
      </div>

    </div>
  );
}
