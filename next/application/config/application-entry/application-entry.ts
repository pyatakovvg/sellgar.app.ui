import { Application, type ApplicationFactory } from '../../lifecycle/application';

/** Default for the first prototype; a project can provide its own factory through withApp. */
export const createApplication: ApplicationFactory = () => new Application();
