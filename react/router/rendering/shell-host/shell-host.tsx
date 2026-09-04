import React from 'react';

import s from './default.module.scss';

interface IProps {
  readonly children: React.ReactNode;
}

export const ShellHost: React.FC<IProps> = (props) => {
  return (
    <div className={s.root} data-tiyn-router-shell-host={''}>
      {props.children}
    </div>
  );
};
