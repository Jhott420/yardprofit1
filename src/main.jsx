import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Simple error boundary
class EB extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  render(){
    if(this.state.err)return React.createElement('div',{style:{minHeight:'100vh',background:'#06060f',color:'#e0e0f0',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',padding:20}},
      React.createElement('div',null,
        React.createElement('div',{style:{fontSize:40,marginBottom:12}},'⚙'),
        React.createElement('div',{style:{fontSize:18,fontWeight:900,color:'#00FF88',marginBottom:8}},'Something went wrong'),
        React.createElement('div',{style:{fontSize:12,color:'#666',marginBottom:20}},this.state.err?.message||'Unknown error'),
        React.createElement('button',{onClick:()=>window.location.reload(),style:{padding:'10px 24px',background:'#00FF88',color:'#06060f',border:'none',borderRadius:8,fontWeight:900,cursor:'pointer',fontFamily:'monospace'}},'RELOAD APP')
      )
    );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EB><App /></EB>
  </React.StrictMode>
)
