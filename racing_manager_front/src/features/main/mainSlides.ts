import aleshkinoImage from '../../shared/assets/aleshkino.png';
import lazutinkaImage from '../../shared/assets/lazutinka.png';
import planernayaImage from '../../shared/assets/planernaya.png';
import type { MainSlide } from '../../shared/types/main';

export const mainSlides: MainSlide[] = [
  {
    key: 'winter-2026',
    title: 'Зимние соревнования 2026',
    subtitle: 'Подготовка и регистрация команд открыта до 15 января.',
    image: aleshkinoImage,
  },
  {
    key: 'new-tracks',
    title: 'Новые трассы сезона',
    subtitle: 'Добавлены 4 новых маршрута с уровнем сложности Expert.',
    image: lazutinkaImage,
  },
  {
    key: 'regional-cup',
    title: 'Кубок региона',
    subtitle: 'Актуальные результаты и онлайн-обновление очков участников.',
    image: planernayaImage,
  },
];
