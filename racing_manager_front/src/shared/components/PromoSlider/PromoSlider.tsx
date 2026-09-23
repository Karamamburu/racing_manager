import { Carousel, Typography } from 'antd';
import { portalPalette } from '../../theme/portalTheme';
import type { MainSlide } from '../../types/main';

type PromoSliderProps = {
  slides: MainSlide[];
};

export function PromoSlider({ slides }: PromoSliderProps) {
  return (
    <Carousel autoplay draggable>
      {slides.map((slide) => (
        <div key={slide.key}>
          <div
            className="hero-slide"
            style={{
              backgroundImage: `linear-gradient(120deg, ${portalPalette.heroWashStart}, ${portalPalette.heroWashEnd}), url(${slide.image})`,
            }}
          >
            <Typography.Title level={2} style={{ color: portalPalette.heroText, marginBottom: 8 }}>
              {slide.title}
            </Typography.Title>
            <Typography.Paragraph style={{ color: portalPalette.heroTextMuted, margin: 0 }}>
              {slide.subtitle}
            </Typography.Paragraph>
          </div>
        </div>
      ))}
    </Carousel>
  );
}
