import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

// Símbolo da área DEV (cabeça de raposa do responsável), traçado à mão em polígono; usado no card e no menu.
export default function IconeDev(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="70 70 940 940" {...props}>
      <path d="M430 300Q540 262 650 300L857 85L855 300L782 500L655 573L683 468L590 578L617 682L635 630L718 645L815 593L1000 603L868 752L697 832L655 935L572 996L554 930A75 40 0 1 0 526 930L508 996L425 935L383 832L212 752L80 603L265 593L362 645L445 630L463 682L490 578L397 468L425 573L298 500L225 300L223 85Z" />
    </SvgIcon>
  );
}
