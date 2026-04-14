import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Admin from './pages/Admin';
import Stage from './pages/Stage';
import Client from './pages/Client';
import MobileUpload from './pages/MobileUpload';

import { MathJaxContext } from 'better-react-mathjax';

const mathjaxConfig = {
  loader: { load: ["input/tex", "output/chtml"] },
  tex: {
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]]
  }
};

function App() {
  return (
    <MathJaxContext config={mathjaxConfig}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Client />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/stage" element={<Stage />} />
          <Route path="/mobile-upload" element={<MobileUpload />} />
        </Routes>
      </BrowserRouter>
    </MathJaxContext>
  );
}

export default App;
