/** "Show more (n left)" under a list that is fetched and shown a page at a time. Renders nothing when everything is showing. */
export default function ShowMore({ left, onClick }) {
  if (left <= 0) return null;
  return (
    <p className="status">
      <button type="button" className="action" onClick={onClick}>
        Show more ({left} left)
      </button>
    </p>
  );
}
