const React = require('react');
const { render } = require('@testing-library/react');
const BusinessCards = require('../../components/BusinessCards');

test('renders BusinessCards component', () => {
  const { getByText } = render(<BusinessCards />);
  const linkElement = getByText(/Business Cards/i);
  expect(linkElement).toBeInTheDocument();
});