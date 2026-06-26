alter table public.image_derivatives
drop constraint if exists image_derivatives_derivative_type_check;

alter table public.image_derivatives
add constraint image_derivatives_derivative_type_check
check (
  derivative_type in (
    'print_extract_raw',
    'print_extract_final',
    'cutout',
    'mask',
    'preview',
    'ai_background',
    'ai_pattern',
    'ai_applied_pattern'
  )
);