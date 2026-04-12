import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Admin from './pages/Admin';
import Stage from './pages/Stage';
import Client from './pages/Client';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Client />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/stage" element={<Stage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
