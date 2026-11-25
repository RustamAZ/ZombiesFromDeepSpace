import './styles.css';
import { SceneController } from './game/scenes/SceneController';

const scenes = new SceneController();
import.meta.hot?.dispose(() => scenes.dispose());
