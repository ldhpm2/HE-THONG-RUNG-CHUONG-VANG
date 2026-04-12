import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Admin from './pages/Admin';
import Stage from './pages/Stage';
import Client from './pages/Client';

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
        </Routes>
      </BrowserRouter>
    </MathJaxContext>
  );
}

export default App;
