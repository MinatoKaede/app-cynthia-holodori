import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import './app/styles.css';
import { mount } from 'svelte';
import App from './app/App.svelte';

mount(App, { target: document.getElementById('app')! });
