import axios from 'axios';
import { useState } from 'react';

const RegisterForm = () => {
  const [formData, setFormData] =
    useState({
      name: '',
      email: '',
      phone: '',
      address: '',
      dob: '',
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await axios.post(
      '/api/users/register',
      formData,
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="name"
        value={formData.name}
        onChange={(e) =>
          setFormData({
            ...formData,
            name: e.target.value,
          })
        }
      />
      <input
        name="email"
        value={formData.email}
        onChange={(e) =>
          setFormData({
            ...formData,
            email: e.target.value,
          })
        }
      />
      <input
        name="phone"
        value={formData.phone}
        onChange={(e) =>
          setFormData({
            ...formData,
            phone: e.target.value,
          })
        }
      />
      <input
        name="address"
        value={formData.address}
        onChange={(e) =>
          setFormData({
            ...formData,
            address: e.target.value,
          })
        }
      />
      <input
        name="dob"
        value={formData.dob}
        onChange={(e) =>
          setFormData({
            ...formData,
            dob: e.target.value,
          })
        }
      />
      <button type="submit">
        Register
      </button>
    </form>
  );
};

export default RegisterForm;
