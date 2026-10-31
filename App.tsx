import { useKeepAwake } from 'expo-keep-awake';
import FrontEnd from './src/app/App';

// The front-end (screens, navigation, stores) lives in src/app; the old single-screen chat is kept in src/ui/LegacyChat.tsx.
export default function App() {
  useKeepAwake();
  return <FrontEnd />;
}
