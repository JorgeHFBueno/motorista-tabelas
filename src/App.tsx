import CollectionViewer from './components/CollectionViewer';

function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Firestore Table Viewer</h1>
      <CollectionViewer collectionName="03-combustivel" />
    </div>
  );
}

export default App;
