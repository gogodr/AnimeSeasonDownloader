import React from 'react';
import SeasonsSection from './components/SeasonsSection';
import SubgroupsSection from './components/SubgroupsSection';
import AlternativeTitlesSection from './components/AlternativeTitlesSection';
import './AdminView.css';

function AdminView() {
  return (
    <div className="admin-view">
      <div className="admin-container">
        <h1 className="admin-title">Admin Panel</h1>
        
        <SeasonsSection />
        
        <div className="section-separator"></div>
        
        <SubgroupsSection />
        
        <div className="section-separator"></div>
        
        <AlternativeTitlesSection />
      </div>
    </div>
  );
}

export default AdminView;

