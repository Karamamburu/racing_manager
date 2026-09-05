import { Carousel, Typography } from 'antd';
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
              backgroundImage: `linear-gradient(120deg, rgba(8, 21, 45, 0.85), rgba(24, 144, 255, 0.35)), url(${slide.image})`,
            }}
          >
            <Typography.Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
              {slide.title}
            </Typography.Title>
            <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0 }}>
              {slide.subtitle}
            </Typography.Paragraph>
          </div>
        </div>
      ))}
    </Carousel>
  );
}
